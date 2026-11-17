// @vitest-environment node
import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "@brandbasket/billing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRazorpayWebhookEvent } from "@/platform/lib/server/razorpay-webhook-handler";
import { isRepeatWebhook, noteWebhook } from "@/platform/lib/server/webhook-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/billing", () => ({ parseRazorpayWebhookEvent: vi.fn(), verifyRazorpayWebhookSignature: vi.fn() }));
vi.mock("@/platform/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/platform/lib/server/billing", () => ({ razorpayWebhookSecret: () => "secret" }));
vi.mock("@brandbasket/shared/server/billing-log", () => ({ logBillingEvent: vi.fn() }));
vi.mock("@/platform/lib/server/razorpay-webhook-handler", () => ({ handleRazorpayWebhookEvent: vi.fn() }));
vi.mock("@/platform/lib/server/webhook-log", () => ({
  noteWebhook: vi.fn(),
  isRepeatWebhook: vi.fn(async () => false),
  webhookEventId: (_body: string, providerId?: string | null) => providerId ?? "body:hash",
}));

const BODY = JSON.stringify({ event: "subscription.charged" });

function post(eventId?: string): Promise<Response> {
  return POST(new Request("http://app.test/api/webhooks/razorpay", { method: "POST", body: BODY, headers: { "x-razorpay-signature": "sig", ...(eventId === undefined ? {} : { "x-razorpay-event-id": eventId }) } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isRepeatWebhook).mockResolvedValue(false);
  vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);
});

describe("POST /api/webhooks/razorpay", () => {
  it("answers 200 and does nothing for an event id it already handled", async () => {
    vi.mocked(isRepeatWebhook).mockResolvedValue(true);
    const response = await post("evt_1");
    expect(response.status).toBe(200);
    expect(isRepeatWebhook).toHaveBeenCalledWith("razorpay", "evt_1");
    expect(handleRazorpayWebhookEvent).not.toHaveBeenCalled();
    expect(noteWebhook).not.toHaveBeenCalled();
  });

  it("records the event id Razorpay sent against the delivery", async () => {
    vi.mocked(parseRazorpayWebhookEvent).mockReturnValue({ kind: "order-paid" } as ReturnType<typeof parseRazorpayWebhookEvent>);
    await post("evt_2");
    expect(noteWebhook).toHaveBeenCalledWith("razorpay", BODY, { result: "handled", eventId: "evt_2" });
  });

  it("does not look for a repeat before the signature is valid", async () => {
    vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(false);
    await post("evt_3");
    expect(isRepeatWebhook).not.toHaveBeenCalled();
  });

  it("notes a bad signature and acts on nothing", async () => {
    vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(false);
    expect((await post()).status).toBe(400);
    expect(noteWebhook).toHaveBeenCalledWith("razorpay", BODY, { result: "bad_signature" });
    expect(handleRazorpayWebhookEvent).not.toHaveBeenCalled();
  });

  it("notes an event it does not act on as ignored, and one it cannot read as failed", async () => {
    vi.mocked(parseRazorpayWebhookEvent).mockReturnValueOnce({ kind: "unhandled" } as ReturnType<typeof parseRazorpayWebhookEvent>);
    await post();
    vi.mocked(parseRazorpayWebhookEvent).mockReturnValueOnce({ kind: "invalid", reason: "x" } as ReturnType<typeof parseRazorpayWebhookEvent>);
    await post();
    expect(noteWebhook).toHaveBeenNthCalledWith(1, "razorpay", BODY, { result: "ignored", eventId: "body:hash" });
    expect(noteWebhook).toHaveBeenNthCalledWith(2, "razorpay", BODY, { result: "failed", error: "Payload could not be read", eventId: "body:hash" });
  });

  it("notes a handled event, and a handler that throws as failed before the error goes on", async () => {
    vi.mocked(parseRazorpayWebhookEvent).mockReturnValue({ kind: "order-paid" } as ReturnType<typeof parseRazorpayWebhookEvent>);
    expect((await post()).status).toBe(200);
    expect(noteWebhook).toHaveBeenCalledWith("razorpay", BODY, { result: "handled", eventId: "body:hash" });
    vi.mocked(handleRazorpayWebhookEvent).mockRejectedValueOnce(new TypeError("db down"));
    await expect(post()).rejects.toThrow("db down");
    expect(noteWebhook).toHaveBeenLastCalledWith("razorpay", BODY, { result: "failed", error: "Handler threw TypeError", eventId: "body:hash" });
  });
});
