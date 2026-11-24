import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runBillingNotices: vi.fn(),
  drainQueuedEmails: vi.fn(),
}));

vi.mock("@/platform/lib/server/billing-notices", () => ({ runBillingNotices: mocks.runBillingNotices }));
vi.mock("@/platform/lib/server/email-queue", () => ({ emailQueueToken: () => "q".repeat(40), drainQueuedEmails: mocks.drainQueuedEmails }));
vi.mock("@/platform/lib/server/website-api-auth", () => ({ hasValidWebsiteToken: (request: Request) => request.headers.get("authorization") === `Bearer ${"q".repeat(40)}` }));

import { POST } from "./route";

const NOTICES = { reminders: 1, lapses: 2, failed: 0 };
const call = (authorization?: string) => POST(new Request("https://app.example.test/api/internal/drain-email-queue", { method: "POST", headers: authorization === undefined ? {} : { authorization } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runBillingNotices.mockResolvedValue(NOTICES);
  mocks.drainQueuedEmails.mockResolvedValue({ sent: 3 });
});

describe("POST /api/internal/drain-email-queue", () => {
  it("runs the billing notices and then drains, reporting both", async () => {
    const response = await call(`Bearer ${"q".repeat(40)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 3, notices: NOTICES });
    expect(mocks.runBillingNotices.mock.invocationCallOrder[0]).toBeLessThan(mocks.drainQueuedEmails.mock.invocationCallOrder[0] ?? 0);
  });

  it("still sends the billing notices when Brevo is not configured", async () => {
    mocks.drainQueuedEmails.mockResolvedValue(null);
    const response = await call(`Bearer ${"q".repeat(40)}`);
    expect(response.status).toBe(503);
    expect(mocks.runBillingNotices).toHaveBeenCalledTimes(1);
  });

  it("runs nothing for a wrong token", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect(mocks.runBillingNotices).not.toHaveBeenCalled();
  });
});
