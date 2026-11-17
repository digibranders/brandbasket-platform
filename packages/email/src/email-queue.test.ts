import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@brandbasket/db";

const suppressed = new Set<string>();
vi.mock("@brandbasket/db", () => ({
  recordEmail: vi.fn(async () => undefined),
  isEmailSuppressed: vi.fn(async (_db: unknown, address: string) => suppressed.has(address)),
}));

const { recordEmail } = await import("@brandbasket/db");
const { createBrevoTransport, createDualTransport, BrevoDeliveryError, nextEmailAttemptAt } = await import("./brevo");
const { isOptionalEmail } = await import("./optional-mail");
const { unsubscribeUrl, verifyUnsubscribe } = await import("./unsubscribe");

const db = {} as Database;
const SECRET = "s".repeat(40);
const monthly = { to: "Owner@Example.in", subject: "Your report", template: "monthly-report", bodyText: "t", bodyHtml: "<p>t</p>" };
const receipt = { to: "owner@example.in", subject: "Receipt", template: "payment-received", bodyText: "t", bodyHtml: "<p>t</p>" };

beforeEach(() => {
  suppressed.clear();
  vi.mocked(recordEmail).mockClear();
});

describe("optional mail", () => {
  it("is decided by template: reports, preview-ready and request replies are optional, receipts and codes are not", () => {
    for (const t of ["monthly-report", "preview-ready", "request-acknowledgement", "change-request-done"]) expect(isOptionalEmail(t)).toBe(true);
    for (const t of ["payment-received", "signup-code", "password-reset", "business-invite", "security-alert"]) expect(isOptionalEmail(t)).toBe(false);
  });

  it("is skipped for a suppressed address, with nothing sent or stored", async () => {
    suppressed.add("owner@example.in");
    const send = vi.fn();
    const outcome = await createDualTransport({ send }, db).send({ ...monthly, to: "owner@example.in" });
    expect(outcome).toEqual({ status: "suppressed" });
    expect(send).not.toHaveBeenCalled();
    expect(recordEmail).not.toHaveBeenCalled();
  });

  it("still sends mandatory mail to a suppressed address", async () => {
    suppressed.add("owner@example.in");
    const send = vi.fn(async () => ({ providerMessageId: "<1>" }));
    await expect(createDualTransport({ send }, db).send(receipt)).resolves.toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("List-Unsubscribe headers", () => {
  async function sentHeaders(message: typeof monthly, unsubscribe?: { secret: string | undefined; origin: string }): Promise<Record<string, string> | undefined> {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    await createBrevoTransport({ apiKey: "k", fetchFn, ...(unsubscribe ? { unsubscribe } : {}) }).send(message);
    const init = vi.mocked(fetchFn).mock.calls[0]?.[1];
    return (JSON.parse(String(init?.body)) as { headers?: Record<string, string> }).headers;
  }

  it("go on optional mail only, pointing at a signed one-click link", async () => {
    const headers = await sentHeaders(monthly, { secret: SECRET, origin: "https://app.brandbasket.in" });
    expect(headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = /^<(.+)>$/.exec(headers?.["List-Unsubscribe"] ?? "")?.[1] ?? "";
    const url = new URL(link);
    expect(url.pathname).toBe("/api/unsubscribe");
    expect(verifyUnsubscribe(url.searchParams.get("e") ?? "", url.searchParams.get("t") ?? "", SECRET)).toBe(true);
    expect(await sentHeaders(receipt, { secret: SECRET, origin: "https://app.brandbasket.in" })).toBeUndefined();
  });

  it("are left off when no secret is set", async () => {
    expect(await sentHeaders(monthly, { secret: undefined, origin: "https://app.brandbasket.in" })).toBeUndefined();
    expect(await sentHeaders(monthly)).toBeUndefined();
  });
});

describe("unsubscribe signing", () => {
  it("rejects a tampered address, a wrong token and a short secret", () => {
    const url = new URL(unsubscribeUrl("a@example.in", { secret: SECRET, origin: "https://x.test" }) ?? "");
    const token = url.searchParams.get("t") ?? "";
    expect(verifyUnsubscribe("a@example.in", token, SECRET)).toBe(true);
    expect(verifyUnsubscribe("A@Example.in", token, SECRET)).toBe(true);
    expect(verifyUnsubscribe("b@example.in", token, SECRET)).toBe(false);
    expect(verifyUnsubscribe("a@example.in", `${token}x`, SECRET)).toBe(false);
    expect(verifyUnsubscribe("a@example.in", token, "short")).toBe(false);
    expect(unsubscribeUrl("a@example.in", { secret: "short", origin: "https://x.test" })).toBeNull();
  });
});

describe("retry schedule", () => {
  it("waits 15 minutes after the first try and an hour after that", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    expect(nextEmailAttemptAt(now, 1).toISOString()).toBe("2026-11-17T10:15:00.000Z");
    expect(nextEmailAttemptAt(now, 2).toISOString()).toBe("2026-11-17T11:00:00.000Z");
    expect(nextEmailAttemptAt(now, 9).toISOString()).toBe("2026-11-17T11:00:00.000Z");
  });
});

describe("a Brevo outage during a webhook", () => {
  it("does not throw out of the transport", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = { send: async () => { throw new BrevoDeliveryError("down", 503, ""); } };
    await expect(createDualTransport(down, db).send(receipt)).resolves.toMatchObject({ status: "queued" });
    error.mockRestore();
  });
});
