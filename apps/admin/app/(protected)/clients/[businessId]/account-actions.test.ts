import { removeConnectedAccount, saveConnectedAccount } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { removeAccountAction, saveAccountAction } from "./account-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, saveConnectedAccount: vi.fn(), removeConnectedAccount: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;
const BACK = (notice: string) => `redirect:/clients/${BUSINESS}/billing?accounts=${notice}#accounts`;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const GOOD = { businessId: BUSINESS, platform: "instagram", handle: "@apex", url: "https://instagram.com/apex", status: "connected", checkedOn: "2026-11-02" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:30:00Z"));
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("saveAccountAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveAccountAction(form(GOOD))).rejects.toThrow("NEXT_REDIRECT");
    expect(saveConnectedAccount).not.toHaveBeenCalled();
  });

  it("saves the account for the named business, logs it and returns to the section", async () => {
    await expect(saveAccountAction(form(GOOD))).rejects.toThrow(BACK("saved"));
    expect(saveConnectedAccount).toHaveBeenCalledWith(DB, {
      businessId: BUSINESS,
      platform: "instagram",
      handle: "@apex",
      url: "https://instagram.com/apex",
      status: "connected",
      checkedAt: new Date("2026-11-02T06:30:00.000Z"),
    });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "account.save", targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("saves nothing and says invalid for a link that is not https, an unknown platform or a future date", async () => {
    await expect(saveAccountAction(form({ ...GOOD, url: "http://instagram.com/apex" }))).rejects.toThrow(BACK("invalid"));
    await expect(saveAccountAction(form({ ...GOOD, platform: "tiktok" }))).rejects.toThrow(BACK("invalid"));
    await expect(saveAccountAction(form({ ...GOOD, checkedOn: "2026-11-09" }))).rejects.toThrow(BACK("invalid"));
    expect(saveConnectedAccount).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a customer who bought neither social nor search", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue([]);
    await expect(saveAccountAction(form(GOOD))).rejects.toThrow(BACK("not-bought"));
    expect(saveConnectedAccount).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id and lets an access log failure propagate", async () => {
    await expect(saveAccountAction(form({ ...GOOD, businessId: "x" }))).rejects.toThrow("must be a valid id");
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(saveAccountAction(form(GOOD))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("removeAccountAction", () => {
  it("removes the platform's account of the named business and logs it", async () => {
    vi.mocked(removeConnectedAccount).mockResolvedValue(true);
    await expect(removeAccountAction(form({ businessId: BUSINESS, platform: "instagram" }))).rejects.toThrow(BACK("removed"));
    expect(removeConnectedAccount).toHaveBeenCalledWith(DB, { businessId: BUSINESS, platform: "instagram" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "account.remove", businessId: BUSINESS }));
  });

  it("logs nothing when there was nothing to remove, and refuses an unknown platform", async () => {
    vi.mocked(removeConnectedAccount).mockResolvedValue(false);
    await expect(removeAccountAction(form({ businessId: BUSINESS, platform: "x" }))).rejects.toThrow(BACK("not-found"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    await expect(removeAccountAction(form({ businessId: BUSINESS, platform: "tiktok" }))).rejects.toThrow(BACK("invalid"));
    expect(removeConnectedAccount).toHaveBeenCalledTimes(1);
  });

  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(removeAccountAction(form({ businessId: BUSINESS, platform: "x" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(removeConnectedAccount).not.toHaveBeenCalled();
  });
});
