import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTakenWebhookEvent: vi.fn(async () => false),
  markEmailBounced: vi.fn(async () => 1),
  suppressEmailAddress: vi.fn(async () => undefined),
  recordWebhookEvent: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => mocks);
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff" }) }));

const { brevoWebhookSecret, handleBrevoEvent, isBrevoRequestAuthorised } = await import("./brevo-webhook");

const SECRET = "b".repeat(40);
const body = (event: Record<string, unknown>): string => JSON.stringify(event);

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockClear();
  mocks.hasTakenWebhookEvent.mockResolvedValue(false);
});

describe("isBrevoRequestAuthorised", () => {
  const request = (url: string, headers: Record<string, string> = {}): Request => new Request(url, { method: "POST", headers });
  it("takes the secret as a bearer token or as ?secret=, and nothing else", () => {
    expect(isBrevoRequestAuthorised(request("https://x.test/api/webhooks/brevo", { authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
    expect(isBrevoRequestAuthorised(request(`https://x.test/api/webhooks/brevo?secret=${SECRET}`), SECRET)).toBe(true);
    expect(isBrevoRequestAuthorised(request("https://x.test/api/webhooks/brevo", { authorization: "Bearer nope" }), SECRET)).toBe(false);
    expect(isBrevoRequestAuthorised(request("https://x.test/api/webhooks/brevo"), SECRET)).toBe(false);
  });
  it("treats a short or missing secret as not configured", () => {
    expect(brevoWebhookSecret({})).toBeNull();
    expect(brevoWebhookSecret({ BREVO_WEBHOOK_SECRET: "short" })).toBeNull();
    expect(brevoWebhookSecret({ BREVO_WEBHOOK_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("handleBrevoEvent", () => {
  it("suppresses a hard bounce, marks the message bounced and notes the delivery", async () => {
    expect(await handleBrevoEvent(body({ event: "hard_bounce", email: "Owner@Example.in", "message-id": "<abc@relay>", id: 77 }))).toBe("handled");
    expect(mocks.suppressEmailAddress).toHaveBeenCalledWith({ name: "staff" }, "Owner@Example.in", "bounce");
    expect(mocks.markEmailBounced).toHaveBeenCalledWith({ name: "staff" }, "<abc@relay>", expect.stringContaining("hard bounce"));
    expect(mocks.recordWebhookEvent).toHaveBeenCalledWith({ name: "staff" }, expect.objectContaining({ source: "brevo", eventType: "hard_bounce", result: "handled", eventId: "77" }));
  });

  it("maps a spam report to a complaint and an unsubscribe to an unsubscribe, without marking a message bounced", async () => {
    await handleBrevoEvent(body({ event: "spam", email: "a@example.in", "message-id": "<1>" }));
    await handleBrevoEvent(body({ event: "unsubscribed", email: "b@example.in", "message-id": "<2>" }));
    expect(mocks.suppressEmailAddress).toHaveBeenNthCalledWith(1, { name: "staff" }, "a@example.in", "complaint");
    expect(mocks.suppressEmailAddress).toHaveBeenNthCalledWith(2, { name: "staff" }, "b@example.in", "unsubscribe");
    expect(mocks.markEmailBounced).not.toHaveBeenCalled();
  });

  it("ignores events that do not stop mail, such as a soft bounce or an open", async () => {
    for (const event of ["soft_bounce", "delivered", "opened", "click"]) expect(await handleBrevoEvent(body({ event, email: "a@example.in" }))).toBe("ignored");
    expect(mocks.suppressEmailAddress).not.toHaveBeenCalled();
  });

  it("answers a repeated event id without handling it twice", async () => {
    mocks.hasTakenWebhookEvent.mockResolvedValue(true);
    expect(await handleBrevoEvent(body({ event: "hard_bounce", email: "a@example.in", id: 5 }))).toBe("handled");
    expect(mocks.suppressEmailAddress).not.toHaveBeenCalled();
  });

  it("reports a body that is not an event, and notes it as failed", async () => {
    expect(await handleBrevoEvent("not json")).toBe("malformed");
    expect(mocks.recordWebhookEvent).toHaveBeenCalledWith({ name: "staff" }, expect.objectContaining({ result: "failed" }));
  });

  it("notes a database failure and rethrows so Brevo retries", async () => {
    mocks.suppressEmailAddress.mockRejectedValueOnce(new Error("db down"));
    await expect(handleBrevoEvent(body({ event: "hard_bounce", email: "a@example.in", id: 6 }))).rejects.toThrow("db down");
    expect(mocks.recordWebhookEvent).toHaveBeenCalledWith({ name: "staff" }, expect.objectContaining({ result: "failed" }));
  });
});
