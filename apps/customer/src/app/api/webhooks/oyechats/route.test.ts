// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleOyeChatsWebhook } from "@/platform/lib/server/oyechats-webhook";
import { noteWebhook } from "@/platform/lib/server/webhook-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/platform/lib/server/oyechats-webhook", () => ({ handleOyeChatsWebhook: vi.fn() }));
vi.mock("@/platform/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/platform/lib/server/webhook-log", () => ({ noteWebhook: vi.fn(), webhookEventId: () => "body:hash" }));

const BODY = JSON.stringify({ event: "lead_captured", bot_id: 41 });

function post(): Promise<Response> {
  return POST(new Request("http://app.test/api/webhooks/oyechats", { method: "POST", body: BODY, headers: { "x-oyechats-signature": "sha256=x" } }));
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/webhooks/oyechats", () => {
  it("notes a recorded lead as handled, linked to the client", async () => {
    vi.mocked(handleOyeChatsWebhook).mockResolvedValue({ kind: "recorded", businessId: "business-1" });
    expect((await post()).status).toBe(200);
    expect(noteWebhook).toHaveBeenCalledWith("oyechats", BODY, { result: "handled", businessId: "business-1", eventId: "body:hash" });
  });

  it("notes an ignored event and a refused one", async () => {
    vi.mocked(handleOyeChatsWebhook).mockResolvedValueOnce({ kind: "ignored" });
    await post();
    vi.mocked(handleOyeChatsWebhook).mockResolvedValueOnce({ kind: "refused" });
    expect((await post()).status).toBe(401);
    expect(noteWebhook).toHaveBeenNthCalledWith(1, "oyechats", BODY, { result: "ignored", eventId: "body:hash" });
    expect(noteWebhook).toHaveBeenNthCalledWith(2, "oyechats", BODY, { result: "bad_signature", eventId: "body:hash" });
  });

  it("answers a repeat delivery with 200 and does not note it again", async () => {
    vi.mocked(handleOyeChatsWebhook).mockResolvedValue({ kind: "duplicate" });
    expect((await post()).status).toBe(200);
    expect(noteWebhook).not.toHaveBeenCalled();
  });

  it("notes a handler that throws as failed before the error goes on", async () => {
    vi.mocked(handleOyeChatsWebhook).mockRejectedValue(new Error("db down"));
    await expect(post()).rejects.toThrow("db down");
    expect(noteWebhook).toHaveBeenCalledWith("oyechats", BODY, { result: "failed", error: "Handler threw Error" });
  });
});
