import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runSocialAutoCatchUp: vi.fn(), liveSocialAutoCatchUpDeps: vi.fn(() => ({})) }));

vi.mock("@/platform/lib/server/social-auto-catch-up", () => mocks);
vi.mock("@/platform/lib/server/email-queue", () => ({ emailQueueToken: () => "q".repeat(40) }));
vi.mock("@/platform/lib/server/website-api-auth", () => ({ hasValidWebsiteToken: (request: Request) => request.headers.get("authorization") === `Bearer ${"q".repeat(40)}` }));

import { POST } from "./route";

const call = (authorization?: string) => POST(new Request("https://app.example.test/api/internal/social-auto-catch-up", { method: "POST", headers: authorization === undefined ? {} : { authorization } }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/internal/social-auto-catch-up", () => {
  it("runs the catch up and answers its report", async () => {
    mocks.runSocialAutoCatchUp.mockResolvedValue({ kind: "skipped" });
    const response = await call(`Bearer ${"q".repeat(40)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "skipped" });
  });

  it("runs nothing for a wrong or missing token", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect(mocks.runSocialAutoCatchUp).not.toHaveBeenCalled();
  });
});
