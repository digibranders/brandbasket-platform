import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPost, loadPosts, loadUsage } from "./loader";
import { getBlogUsage } from "./server/usage";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => "event-1") }));
vi.mock("@/features/website/loader", () => ({ loadWebsitePages: vi.fn() }));
vi.mock("./server/payload", () => ({ getBlogPayload: async () => payload }));
vi.mock("./server/usage", () => ({ getBlogUsage: vi.fn() }));

const MINE = "0192f3c4-1111-7000-8000-000000000001";
const customer = { tenant: { businessId: MINE }, billing: { plan: null } } as never;
const NOW = new Date("2026-11-03T10:00:00.000Z");
let payload: { findByID: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  payload = { findByID: vi.fn(), find: vi.fn() };
});

describe("the blog loaders", () => {
  it("return a failure for the panel, not an empty list, when the posts cannot be read", async () => {
    payload.find.mockRejectedValue(new Error("connection reset"));
    expect(await loadPosts(customer, NOW)).toEqual({ ok: false, error: { at: expect.any(Date), eventId: "event-1" } });
  });

  it("return a failure, not a 404, when a post cannot be read", async () => {
    payload.findByID.mockRejectedValue(new Error("timeout"));
    expect((await loadPost(customer, "7", NOW)).ok).toBe(false);
  });

  it("load a missing post and another business's post as null alike", async () => {
    payload.findByID.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    expect(await loadPost(customer, "7", NOW)).toEqual({ ok: true, data: null });
    payload.findByID.mockResolvedValueOnce({ id: 7, businessId: "someone-else" });
    expect(await loadPost(customer, "7", NOW)).toEqual({ ok: true, data: null });
  });

  it("fail the usage line on its own", async () => {
    vi.mocked(getBlogUsage).mockRejectedValue(new Error("down"));
    expect((await loadUsage(customer)).ok).toBe(false);
  });
});
