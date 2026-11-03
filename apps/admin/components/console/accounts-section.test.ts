import { listConnectedAccountsForStaff } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { AccountsSection } from "./accounts-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listConnectedAccountsForStaff: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/account-actions", () => ({ saveAccountAction: vi.fn(), removeAccountAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const ACCOUNT = {
  id: "a1",
  businessId: BUSINESS,
  platform: "instagram",
  handle: "@apex",
  url: "https://instagram.com/apex",
  status: "needs_attention",
  checkedAt: new Date("2026-11-02T06:30:00Z"),
};

async function render(notice: Parameters<typeof AccountsSection>[0]["notice"] = null): Promise<string> {
  return renderToStaticMarkup(await AccountsSection({ businessId: BUSINESS, notice }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
  vi.mocked(listConnectedAccountsForStaff).mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:30:00Z"));
});

describe("AccountsSection", () => {
  it("renders nothing when the customer bought neither social nor search", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue([]);
    expect(await render()).toBe("");
    expect(listConnectedAccountsForStaff).not.toHaveBeenCalled();
  });

  it("offers every platform to add when none is listed, defaulting the check date to today", async () => {
    const html = await render();
    expect(html).toContain('id="accounts"');
    for (const label of ["Instagram", "Facebook Page", "Google Business Profile", "YouTube", "LinkedIn", "WhatsApp Business"]) expect(html).toContain(`>${label}</option>`);
    expect(html).toContain('value="2026-11-03"');
    expect(html.match(/Add account/g)).toHaveLength(1);
  });

  it("lists an account with its state, an edit form filled in and a remove button, and leaves it out of the add choices", async () => {
    vi.mocked(listConnectedAccountsForStaff).mockResolvedValue([ACCOUNT] as never);
    const html = await render();
    expect(html).toContain("Needs attention, @apex. Checked 2 November 2026");
    expect(html).toContain('value="@apex"');
    expect(html).toContain('<input type="hidden" name="platform" value="instagram"/>');
    expect(html).toContain("Remove account: Instagram");
    expect(html).toContain('value="2026-11-02"');
    expect(html).not.toContain('<option value="instagram">');
    expect(html).toContain('<option value="facebook">');
  });

  it("drops the add form when every platform is listed", async () => {
    const all = ["instagram", "facebook", "google_business", "youtube", "linkedin", "x", "whatsapp_business"].map((platform) => ({ ...ACCOUNT, id: platform, platform }));
    vi.mocked(listConnectedAccountsForStaff).mockResolvedValue(all as never);
    expect(await render()).not.toContain("Add account");
  });

  it("shows the notice for what just happened", async () => {
    expect(await render("saved")).toContain("Account saved.");
    expect(await render("invalid")).toContain("Check the account");
    expect(await render(null)).not.toContain('role="status"');
  });
});
