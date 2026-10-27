import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "@brandbasket/billing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRazorpayWebhookEvent } from "@/lib/server/razorpay-webhook-handler";
import { noteWebhook } from "@/lib/server/webhook-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/billing", () => ({ parseRazorpayWebhookEvent: vi.fn(), verifyRazorpayWebhookSignature: vi.fn() }));
vi.mock("@/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/billing", () => ({ razorpayWebhookSecret: () => "secret" }));
vi.mock("@brandbasket/shared/server/billing-log", () => ({ logBillingEvent: vi.fn() }));
vi.mock("@/lib/server/razorpay-webhook-handler", () => ({ handleRazorpayWebhookEvent: vi.fn() }));
vi.mock("@/lib/server/webhook-log", () => ({ noteWebhook: vi.fn() }));

const BODY = JSON.stringify({ event: "subscription.charged" });

function post(): Promise<Response> {
  return POST(new Request("http://app.test/api/webhooks/razorpay", { method: "POST", body: BODY, headers: { "x-razorpay-signature": "sig" } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);
});

describe("POST /api/webhooks/razorpay", () => {
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
    expect(noteWebhook).toHaveBeenNthCalledWith(1, "razorpay", BODY, { result: "ignored" });
    expect(noteWebhook).toHaveBeenNthCalledWith(2, "razorpay", BODY, { result: "failed", error: "Payload could not be read" });
  });

  it("notes a handled event, and a handler that throws as failed before the error goes on", async () => {
    vi.mocked(parseRazorpayWebhookEvent).mockReturnValue({ kind: "order-paid" } as ReturnType<typeof parseRazorpayWebhookEvent>);
    expect((await post()).status).toBe(200);
    expect(noteWebhook).toHaveBeenCalledWith("razorpay", BODY, { result: "handled" });
    vi.mocked(handleRazorpayWebhookEvent).mockRejectedValueOnce(new TypeError("db down"));
    await expect(post()).rejects.toThrow("db down");
    expect(noteWebhook).toHaveBeenLastCalledWith("razorpay", BODY, { result: "failed", error: "Handler threw TypeError" });
  });
});
