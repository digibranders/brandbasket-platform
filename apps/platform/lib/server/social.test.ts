import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listWaitingPosts, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadSocial, loadWaitingPostCount } from "./social";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  latestMonthlyReport: vi.fn(),
  listBoughtSetupServices: vi.fn(),
  listDeliverablesForBusiness: vi.fn(),
  listWaitingPosts: vi.fn(),
  withTenantScope: vi.fn(),
}));

const tx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const now = new Date("2026-10-27T10:00:00Z");

function row(id: string, dueOn: string, status: "planned" | "awaiting_approval" | "approved" | "published", over: Record<string, unknown> = {}): never {
  return { id, kind: "post", title: `Post ${id}`, caption: "Words", dueOn, status, linkUrl: null, imageKey: null, ...over } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app-db" } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"]);
  vi.mocked(listDeliverablesForBusiness).mockResolvedValue([]);
  vi.mocked(latestMonthlyReport).mockResolvedValue(null);
  vi.mocked(listWaitingPosts).mockResolvedValue([]);
});

describe("loadSocial", () => {
  it("is null when Social media is not bought, and reads nothing else", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"]);
    expect(await loadSocial(tenant, now)).toBeNull();
    expect(listDeliverablesForBusiness).not.toHaveBeenCalled();
  });

  it("asks for this month stretched to the end of the week, and keeps an awaiting post due next month", async () => {
    const later = row("later", "2026-11-09", "awaiting_approval", { imageKey: "deliverables/later/display" });
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([row("a", "2026-10-28", "planned"), later]);

    const data = await loadSocial(tenant, now);

    expect(listDeliverablesForBusiness).toHaveBeenCalledWith(tx, "business-1", { service: "social", from: "2026-10-01", to: "2026-11-01" });
    expect(data?.posts.map((post) => [post.id, post.status, post.hasImage])).toEqual([
      ["a", "planned", false],
      ["later", "awaiting_approval", true],
    ]);
  });

  it("builds the month line and the report link", async () => {
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([row("a", "2026-10-02", "published"), row("b", "2026-10-28", "planned")]);
    vi.mocked(latestMonthlyReport).mockResolvedValue({ url: "https://example.com/report" } as never);

    const data = await loadSocial(tenant, now);

    expect(data?.monthLine).toBe("October: 1 of 2 posts out.");
    expect(data?.report).toBe("https://example.com/report");
    expect(latestMonthlyReport).toHaveBeenCalledWith(tx, "business-1", "social");
  });

  it("still draws when the posts and the report cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listDeliverablesForBusiness).mockRejectedValue(new Error("db down"));
    vi.mocked(latestMonthlyReport).mockRejectedValue(new Error("db down"));

    const data = await loadSocial(tenant, now);

    expect(data).toMatchObject({ posts: [], monthLine: null, report: null });
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});

describe("loadWaitingPostCount", () => {
  it("counts the waiting posts and names the earliest day", async () => {
    vi.mocked(listWaitingPosts).mockResolvedValue([row("a", "2026-11-04", "awaiting_approval"), row("b", "2026-11-02", "awaiting_approval")]);
    expect(await loadWaitingPostCount(tenant)).toEqual({ count: 2, by: "Mon 2 Nov" });
    expect(listWaitingPosts).toHaveBeenCalledWith(tx, "business-1");
  });

  it("is zero with no day when none are waiting", async () => {
    expect(await loadWaitingPostCount(tenant)).toEqual({ count: 0, by: null });
  });
});
