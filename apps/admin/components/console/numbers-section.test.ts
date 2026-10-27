import { listMonthlySnapshots } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { NumbersSection } from "./numbers-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listMonthlySnapshots: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/numbers-actions", () => ({ saveNumbersAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

async function render(notice: "saved" | "invalid" | "not-bought" | null = null): Promise<string> {
  return renderToStaticMarkup(await NumbersSection({ businessId: BUSINESS, notice }));
}

const SNAPSHOT = {
  service: "social",
  month: "2026-10-01",
  adSpendCents: 1_250_000,
  adBudgetCents: 1_500_000,
  adEnquiries: 9,
  postsPublished: 11,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listMonthlySnapshots).mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T06:30:00Z"));
});

describe("NumbersSection", () => {
  it("renders nothing when the business bought neither service", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue([]);
    expect(await render()).toBe("");
    expect(listMonthlySnapshots).not.toHaveBeenCalled();
  });

  it("shows only the ads form for Social and no search inputs", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    const html = await render();
    expect(html).toContain('id="numbers"');
    expect(html).toContain("Monthly numbers");
    expect(html).toContain("Saving replaces that month");
    expect(html).toContain('name="adSpendRupees"');
    expect(html).toContain('name="adBudgetRupees"');
    expect(html).toContain('name="adEnquiries"');
    expect(html).toContain('name="postsPublished"');
    expect(html).toContain('name="postsPlanned"');
    expect(html).not.toContain('name="keywordsPageOne"');
    expect(html).toContain('<input type="hidden" name="service" value="social"/>');
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html.match(/Save numbers/g)).toHaveLength(1);
  });

  it("offers this month and the five before it, in India time", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    const html = await render();
    for (const value of ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]) expect(html).toContain(`value="${value}"`);
    expect(html).not.toContain('value="2026-04"');
    expect(html).not.toContain('value="2026-11"');
  });

  it("uses India time for the current month at a month boundary", async () => {
    vi.setSystemTime(new Date("2026-10-31T19:00:00Z"));
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    const html = await render();
    expect(html).toContain('value="2026-11"');
    expect(html).not.toContain('value="2026-05"');
  });

  it("shows only the search form for Search", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    const html = await render();
    expect(html).toContain('name="keywordsPageOne"');
    expect(html).toContain('name="keywordsPageOnePrev"');
    expect(html).not.toContain('name="adSpendRupees"');
  });

  it("shows both forms when both services are bought", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social", "search"]);
    const html = await render();
    expect(html).toContain('name="adSpendRupees"');
    expect(html).toContain('name="keywordsPageOne"');
    expect(html.match(/Save numbers/g)).toHaveLength(2);
  });

  it("lists the last three months of saved figures, money in rupees, blanks as a dash", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    vi.mocked(listMonthlySnapshots).mockImplementation(async (_db, _id, month) => (month === "2026-10-01" ? ([SNAPSHOT] as never) : []));
    const html = await render();
    expect(vi.mocked(listMonthlySnapshots).mock.calls.map((call) => call[2])).toEqual(["2026-10-01", "2026-09-01", "2026-08-01"]);
    expect(html).toContain("October 2026");
    expect(html).toContain("₹12,500");
    expect(html).toContain("₹15,000");
    expect(html).toContain(">9<");
    expect(html).toContain("September 2026");
  });

  it("shows the notice for what just happened", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    expect(await render("saved")).toContain("Numbers saved.");
    expect(await render("invalid")).toContain("Check the numbers: whole numbers only, and enter at least one.");
    expect(await render("not-bought")).toContain("That service is not on this customer&#x27;s plan.");
    expect(await render(null)).not.toContain('role="status"');
  });
});
