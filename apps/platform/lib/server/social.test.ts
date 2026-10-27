import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listMonthlySnapshots, listWaitingPosts, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadSocial, loadWaitingPostCount } from "./social";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  latestMonthlyReport: vi.fn(),
  listBoughtSetupServices: vi.fn(),
  listDeliverablesForBusiness: vi.fn(),
  listMonthlySnapshots: vi.fn(),
  listWaitingPosts: vi.fn(),
  withTenantScope: vi.fn(),
}));

const tx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const now = new Date("2026-10-27T10:00:00Z");
const billing = { subscription: { adCreditCents: 150000 } } as never;

function row(id: string, dueOn: string, status: "planned" | "awaiting_approval" | "approved" | "published", over: Record<string, unknown> = {}): never {
  return { id, kind: "post", title: `Post ${id}`, caption: "Words", dueOn, status, linkUrl: null, imageKey: null, ...over } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app-db" } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"]);
  vi.mocked(listDeliverablesForBusiness).mockResolvedValue([]);
  vi.mocked(listMonthlySnapshots).mockResolvedValue([]);
  vi.mocked(latestMonthlyReport).mockResolvedValue(null);
  vi.mocked(listWaitingPosts).mockResolvedValue([]);
});

describe("loadSocial", () => {
  it("is null when Social & Ads is not bought, and reads nothing else", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"]);
    expect(await loadSocial(tenant, billing, now)).toBeNull();
    expect(listDeliverablesForBusiness).not.toHaveBeenCalled();
  });

  it("asks for this month stretched to the end of the week, and keeps an awaiting post due next month", async () => {
    const later = row("later", "2026-11-09", "awaiting_approval", { imageKey: "deliverables/later/display" });
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([row("a", "2026-10-28", "planned"), later]);

    const data = await loadSocial(tenant, billing, now);

    expect(listDeliverablesForBusiness).toHaveBeenCalledWith(tx, "business-1", { service: "social", from: "2026-10-01", to: "2026-11-01" });
    expect(data?.posts.map((post) => [post.id, post.status, post.hasImage])).toEqual([
      ["a", "planned", false],
      ["later", "awaiting_approval", true],
    ]);
    expect(data?.month).toBe("October");
  });

  it("builds the month line, the ads panel and the report link", async () => {
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([row("a", "2026-10-02", "published"), row("b", "2026-10-28", "planned")]);
    vi.mocked(listMonthlySnapshots).mockResolvedValue([
      { service: "search", adSpendCents: null, adBudgetCents: null, adEnquiries: null, keywordsPageOne: 3 },
      { service: "social", adSpendCents: 624000, adBudgetCents: 1000000, adEnquiries: 9 },
    ] as never);
    vi.mocked(latestMonthlyReport).mockResolvedValue({ url: "https://example.com/report" } as never);

    const data = await loadSocial(tenant, billing, now);

    expect(data?.monthLine).toBe("October: 1 of 2 posts out.");
    expect(data?.ads).toMatchObject({ enquiries: 9, percent: 62 });
    expect(data?.ads?.adMoney).not.toBeNull();
    expect(data?.report).toBe("https://example.com/report");
    expect(listMonthlySnapshots).toHaveBeenCalledWith(tx, "business-1", "2026-10-01");
    expect(latestMonthlyReport).toHaveBeenCalledWith(tx, "business-1", "social");
  });

  it("leaves the ads out when the numbers cannot be read, and keeps the posts", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([row("a", "2026-10-28", "planned")]);
    vi.mocked(listMonthlySnapshots).mockRejectedValue(new Error("db down"));

    const data = await loadSocial(tenant, { subscription: null } as never, now);

    expect(data?.ads).toBeNull();
    expect(data?.posts).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("[social] could not read the ads numbers", expect.anything());
    log.mockRestore();
  });

  it("still draws when the posts and the report cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listDeliverablesForBusiness).mockRejectedValue(new Error("db down"));
    vi.mocked(latestMonthlyReport).mockRejectedValue(new Error("db down"));

    const data = await loadSocial(tenant, billing, now);

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
