import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadSearch } from "./search";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  latestMonthlyReport: vi.fn(),
  listBoughtSetupServices: vi.fn(),
  listDeliverablesForBusiness: vi.fn(),
  listMonthlySnapshots: vi.fn(),
  withTenantScope: vi.fn(),
}));

const tx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const now = new Date("2026-10-27T10:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app-db" } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"]);
  vi.mocked(listDeliverablesForBusiness).mockResolvedValue([]);
  vi.mocked(listMonthlySnapshots).mockResolvedValue([]);
  vi.mocked(latestMonthlyReport).mockResolvedValue(null);
});

describe("loadSearch", () => {
  it("is null when Search is not bought, and reads nothing else", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"]);
    expect(await loadSearch(tenant, now)).toBeNull();
    expect(listDeliverablesForBusiness).not.toHaveBeenCalled();
  });

  it("summarises the month's snapshot and finished work, and passes on the report", async () => {
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([
      { id: "p1", kind: "page", title: "Home", status: "published", dueOn: "2026-10-12", linkUrl: "https://example.com/" },
      { id: "l1", kind: "listing", title: "Google profile", status: "published", dueOn: "2026-10-14", linkUrl: null },
    ] as never);
    vi.mocked(listMonthlySnapshots).mockResolvedValue([{ service: "search", keywordsPageOne: 5, keywordsPageOnePrev: 3 }] as never);
    vi.mocked(latestMonthlyReport).mockResolvedValue({ url: "https://example.com/report" } as never);

    const data = await loadSearch(tenant, now);

    expect(listDeliverablesForBusiness).toHaveBeenCalledWith(tx, "business-1", { service: "search", from: "2026-10-01", to: "2026-11-01" });
    expect(data?.summary.pageOne).toEqual({ figure: "5", detail: "Up from 3" });
    expect(data?.summary.pages.map((page) => page.id)).toEqual(["p1"]);
    expect(data?.summary.listings.map((listing) => listing.id)).toEqual(["l1"]);
    expect(data?.report).toBe("https://example.com/report");
    expect(data?.month).toBe("October");
  });

  it("leaves the page-one figure out when the snapshot cannot be read, and keeps the rest", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listDeliverablesForBusiness).mockResolvedValue([{ id: "p1", kind: "page", title: "Home", status: "published", dueOn: "2026-10-12", linkUrl: null }] as never);
    vi.mocked(listMonthlySnapshots).mockRejectedValue(new Error("db down"));

    const data = await loadSearch(tenant, now);

    expect(data?.summary.pageOne).toBeNull();
    expect(data?.summary.pages).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("[search] could not read the monthly numbers", expect.anything());
    log.mockRestore();
  });
});
