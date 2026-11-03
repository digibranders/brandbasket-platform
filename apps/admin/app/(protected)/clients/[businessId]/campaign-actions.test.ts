import { addAdCampaign, removeAdCampaign, updateAdCampaign } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { removeCampaignAction, saveCampaignAction } from "./campaign-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, addAdCampaign: vi.fn(), updateAdCampaign: vi.fn(), removeAdCampaign: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const CAMPAIGN = "01a0f71b-8402-7d48-a90a-207e8c8a8999";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;
const BACK = (notice: string) => `redirect:/clients/${BUSINESS}/billing?campaigns=${notice}#campaigns`;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const ADD = { businessId: BUSINESS, month: "2026-10", name: "Full body checkup", platform: "meta", objective: "Leads", spendRupees: "4,120", budgetRupees: "5000", impressions: "", clicks: "320", leads: "9" };
const FIGURES = { name: "Full body checkup", platform: "meta", objective: "Leads", spendCents: 412000, budgetCents: 500000, impressions: null, clicks: 320, leads: 9 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:30:00Z"));
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
  vi.mocked(addAdCampaign).mockResolvedValue("saved");
  vi.mocked(updateAdCampaign).mockResolvedValue("saved");
  vi.mocked(removeAdCampaign).mockResolvedValue(true);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("saveCampaignAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveCampaignAction(form(ADD))).rejects.toThrow("NEXT_REDIRECT");
    expect(addAdCampaign).not.toHaveBeenCalled();
  });

  it("adds a campaign in paise for the first of the month as the signed-in staff member, logs it and returns to the section", async () => {
    await expect(saveCampaignAction(form(ADD))).rejects.toThrow(BACK("saved"));
    expect(addAdCampaign).toHaveBeenCalledWith(DB, { businessId: BUSINESS, month: "2026-10-01", figures: FIGURES, staffId: "staff-1" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "campaign.add", targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("says duplicate and logs nothing when the name is already used that month", async () => {
    vi.mocked(addAdCampaign).mockResolvedValue("duplicate");
    await expect(saveCampaignAction(form(ADD))).rejects.toThrow(BACK("duplicate"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("saves nothing and says invalid for a bad figure, a month after this one or a missing month", async () => {
    await expect(saveCampaignAction(form({ ...ADD, leads: "nine" }))).rejects.toThrow(BACK("invalid"));
    await expect(saveCampaignAction(form({ ...ADD, month: "2026-12" }))).rejects.toThrow(BACK("invalid"));
    await expect(saveCampaignAction(form({ ...ADD, month: "" }))).rejects.toThrow(BACK("invalid"));
    expect(addAdCampaign).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a customer who did not buy Social & Ads", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(saveCampaignAction(form(ADD))).rejects.toThrow(BACK("not-bought"));
    expect(addAdCampaign).not.toHaveBeenCalled();
  });

  it("corrects a campaign in place when an id is sent, and ignores any month in the form", async () => {
    await expect(saveCampaignAction(form({ ...ADD, id: CAMPAIGN, month: "" }))).rejects.toThrow(BACK("saved"));
    expect(updateAdCampaign).toHaveBeenCalledWith(DB, { id: CAMPAIGN, businessId: BUSINESS, figures: FIGURES, staffId: "staff-1", now: expect.any(Date) });
    expect(addAdCampaign).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.update", businessId: BUSINESS }));
  });

  it("reports a campaign that belongs to another business as not found and logs nothing", async () => {
    vi.mocked(updateAdCampaign).mockResolvedValue("not-found");
    await expect(saveCampaignAction(form({ ...ADD, id: CAMPAIGN }))).rejects.toThrow(BACK("not-found"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("throws on a business id or campaign id that is not an id", async () => {
    await expect(saveCampaignAction(form({ ...ADD, businessId: "x" }))).rejects.toThrow("must be a valid id");
    await expect(saveCampaignAction(form({ ...ADD, id: "x" }))).rejects.toThrow("must be a valid id");
    expect(addAdCampaign).not.toHaveBeenCalled();
    expect(updateAdCampaign).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(saveCampaignAction(form(ADD))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("removeCampaignAction", () => {
  it("removes the campaign only within the named business, logs it and returns to the section", async () => {
    await expect(removeCampaignAction(form({ id: CAMPAIGN, businessId: BUSINESS }))).rejects.toThrow(BACK("removed"));
    expect(removeAdCampaign).toHaveBeenCalledWith(DB, { id: CAMPAIGN, businessId: BUSINESS });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.remove", businessId: BUSINESS }));
  });

  it("logs nothing when there was nothing to remove", async () => {
    vi.mocked(removeAdCampaign).mockResolvedValue(false);
    await expect(removeCampaignAction(form({ id: CAMPAIGN, businessId: BUSINESS }))).rejects.toThrow(BACK("not-found"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("is refused for a session that is not staff's and throws on a bad id", async () => {
    await expect(removeCampaignAction(form({ id: "x", businessId: BUSINESS }))).rejects.toThrow("must be a valid id");
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(removeCampaignAction(form({ id: CAMPAIGN, businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(removeAdCampaign).not.toHaveBeenCalled();
  });
});
