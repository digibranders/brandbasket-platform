// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCalcomWebhook } from "@/platform/lib/server/calcom-webhook";
import { noteWebhook } from "@/platform/lib/server/webhook-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/platform/lib/server/calcom-webhook", () => ({ handleCalcomWebhook: vi.fn() }));
vi.mock("@/platform/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/platform/lib/server/webhook-log", () => ({ noteWebhook: vi.fn(), webhookEventId: () => "body:hash" }));

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
    [{ kind: "moved" }, { result: "handled", eventId: "body:hash" }, 200],
    [{ kind: "removed" }, { result: "handled", eventId: "body:hash" }, 200],
    [{ kind: "ignored" }, { result: "ignored", eventId: "body:hash" }, 200],
    [{ kind: "stale" }, { result: "ignored", error: "Delivery older than 5 minutes", eventId: "body:hash" }, 200],
    [{ kind: "refused" }, { result: "bad_signature", eventId: "body:hash" }, 401],
    [{ kind: "unconfigured" }, { result: "failed", error: "CALCOM_WEBHOOK_SECRET is not set", eventId: "body:hash" }, 503],
  ] as const)("notes %o as %o", async (handled, noted, status) => {
    vi.mocked(handleCalcomWebhook).mockResolvedValue(handled);
    expect((await post()).status).toBe(status);
    expect(noteWebhook).toHaveBeenCalledWith("calcom", BODY, noted);
  });

  it("answers a repeat delivery with 200 and does not note it again", async () => {
    vi.mocked(handleCalcomWebhook).mockResolvedValue({ kind: "duplicate" });
    expect((await post()).status).toBe(200);
    expect(noteWebhook).not.toHaveBeenCalled();
  });

  it("notes a handler that throws as failed before the error goes on", async () => {
    vi.mocked(handleCalcomWebhook).mockRejectedValue(new RangeError("bad date"));
    await expect(post()).rejects.toThrow("bad date");
    expect(noteWebhook).toHaveBeenCalledWith("calcom", BODY, { result: "failed", error: "Handler threw RangeError" });
  });
});
