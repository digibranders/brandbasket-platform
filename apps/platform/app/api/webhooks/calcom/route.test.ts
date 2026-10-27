import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCalcomWebhook } from "@/lib/server/calcom-webhook";
import { noteWebhook } from "@/lib/server/webhook-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/calcom-webhook", () => ({ handleCalcomWebhook: vi.fn() }));
vi.mock("@/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/webhook-log", () => ({ noteWebhook: vi.fn() }));

const BODY = JSON.stringify({ triggerEvent: "BOOKING_RESCHEDULED", payload: {} });

function post(): Promise<Response> {
  return POST(new Request("http://app.test/api/webhooks/calcom", { method: "POST", body: BODY, headers: { "x-cal-signature-256": "sig" } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/webhooks/calcom", () => {
  it.each([
    [{ kind: "moved" }, { result: "handled" }, 200],
    [{ kind: "removed" }, { result: "handled" }, 200],
    [{ kind: "ignored" }, { result: "ignored" }, 200],
    [{ kind: "refused" }, { result: "bad_signature" }, 401],
    [{ kind: "unconfigured" }, { result: "failed", error: "CALCOM_WEBHOOK_SECRET is not set" }, 503],
  ] as const)("notes %o as %o", async (handled, noted, status) => {
    vi.mocked(handleCalcomWebhook).mockResolvedValue(handled);
    expect((await post()).status).toBe(status);
    expect(noteWebhook).toHaveBeenCalledWith("calcom", BODY, noted);
  });

  it("notes a handler that throws as failed before the error goes on", async () => {
    vi.mocked(handleCalcomWebhook).mockRejectedValue(new RangeError("bad date"));
    await expect(post()).rejects.toThrow("bad date");
    expect(noteWebhook).toHaveBeenCalledWith("calcom", BODY, { result: "failed", error: "Handler threw RangeError" });
  });
});
