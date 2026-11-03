import { listAdCampaigns } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { CampaignsSection } from "./campaigns-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listAdCampaigns: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/campaign-actions", () => ({ saveCampaignAction: vi.fn(), removeCampaignAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const ROW = {
  id: "01a0f71b-8402-7d48-a90a-207e8c8a8999",
  month: "2026-10-01",
  name: "Full body checkup, Dadar",
  platform: "meta",
  objective: "Leads",
  spendCents: 412_000,
  budgetCents: 500_000,
  impressions: null,
  clicks: 320,
  leads: 1,
};

async function render(notice: Parameters<typeof CampaignsSection>[0]["notice"] = null): Promise<string> {
  return renderToStaticMarkup(await CampaignsSection({ businessId: BUSINESS, notice }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
  vi.mocked(listAdCampaigns).mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:30:00Z"));
});

describe("CampaignsSection", () => {
  it("renders nothing unless the customer bought Social & Ads", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    expect(await render()).toBe("");
    expect(listAdCampaigns).not.toHaveBeenCalled();
  });

  it("shows the add form with this month and the five before it", async () => {
    const html = await render();
    expect(html).toContain('id="campaigns"');
    expect(html).toContain("Ad campaigns");
    for (const name of ["name", "platform", "objective", "spendRupees", "budgetRupees", "impressions", "clicks", "leads"]) expect(html).toContain(`name="${name}"`);
    for (const value of ["2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06"]) expect(html).toContain(`value="${value}"`);
    expect(html).not.toContain('value="2026-05"');
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html.match(/Add campaign/g)).toHaveLength(1);
  });

  it("lists a saved campaign under its month with an edit form filled in, a remove button and the money in rupees", async () => {
    vi.mocked(listAdCampaigns).mockImplementation(async (_db, _id, month) => (month === "2026-10-01" ? ([ROW] as never) : []));
    const html = await render();
    expect(html).toContain("October 2026");
    expect(html).toContain("Meta (Facebook and Instagram), Leads. Spent ₹4,120 of ₹5,000, 1 lead");
    expect(html).toContain('value="Full body checkup, Dadar"');
    expect(html).toContain('value="4120"');
    expect(html).toContain(`name="id" value="${ROW.id}"`);
    expect(html).toContain("Remove campaign: Full body checkup, Dadar");
    expect(html).not.toContain("September 2026</h3>");
  });

  it("shows the notice for what just happened", async () => {
    expect(await render("saved")).toContain("Campaign saved.");
    expect(await render("duplicate")).toContain("already has a campaign with that name");
    expect(await render("invalid")).toContain("Check the campaign");
    expect(await render(null)).not.toContain('role="status"');
  });
});
