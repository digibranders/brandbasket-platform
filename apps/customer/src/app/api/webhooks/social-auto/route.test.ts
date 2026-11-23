// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteSocialAutoFailure } from "@/platform/lib/server/social-auto-deps";
import { handleSocialAutoWebhook } from "@/platform/lib/server/social-auto-webhook";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/platform/lib/server/social-auto-deps", () => ({ socialAutoDeps: vi.fn(() => ({})), noteSocialAutoFailure: vi.fn(async () => undefined) }));
vi.mock("@/platform/lib/server/social-auto-webhook", () => ({ handleSocialAutoWebhook: vi.fn() }));
vi.mock("@/platform/lib/server/security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));

const BODY = JSON.stringify({ id: "e1", type: "post.failed", data: {} });
const post = (body: string = BODY): Promise<Response> => POST(new Request("http://app.test/api/webhooks/social-auto", { method: "POST", body, headers: { "x-social-signature": "t=1,v1=00" } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/webhooks/social-auto", () => {
  it.each([
    [{ kind: "handled", businessId: "b" }, 200],
    [{ kind: "ignored" }, 200],
    [{ kind: "duplicate" }, 200],
    [{ kind: "refused" }, 401],
    [{ kind: "unconfigured" }, 503],
  ] as const)("answers %o with %i", async (result, status) => {
    vi.mocked(handleSocialAutoWebhook).mockResolvedValue(result);
    expect((await post()).status).toBe(status);
  });

  it("notes a refused delivery as a bad signature", async () => {
    vi.mocked(handleSocialAutoWebhook).mockResolvedValue({ kind: "refused" });
    await post();
    expect(noteSocialAutoFailure).toHaveBeenCalledWith(BODY, "bad_signature", null);
  });

  it("notes a handler that throws as failed before the error goes on, so social-auto retries", async () => {
    vi.mocked(handleSocialAutoWebhook).mockRejectedValue(new RangeError("x"));
    await expect(post()).rejects.toThrow("x");
    expect(noteSocialAutoFailure).toHaveBeenCalledWith(BODY, "failed", "Handler threw RangeError");
  });

  it("refuses a body over the size cap with 413", async () => {
    expect((await post("x".repeat(70 * 1024))).status).toBe(413);
  });
});
