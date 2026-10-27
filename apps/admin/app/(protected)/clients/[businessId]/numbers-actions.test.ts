import { upsertMonthlySnapshot } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { saveNumbersAction } from "./numbers-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, upsertMonthlySnapshot: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const SOCIAL = { businessId: BUSINESS, service: "social", month: "2026-10", adSpendRupees: "12,500", adBudgetRupees: "15000", adEnquiries: "9", postsPublished: "11", postsPlanned: "12" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(listBoughtServices).mockResolvedValue(["social", "search"]);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("saveNumbersAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveNumbersAction(form(SOCIAL))).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMonthlySnapshot).not.toHaveBeenCalled();
  });

  it("saves good Social figures in paise for the first of the month, logs it and returns to the section", async () => {
    await expect(saveNumbersAction(form(SOCIAL))).rejects.toThrow(`redirect:/clients/${BUSINESS}?numbers=saved#numbers`);
    expect(upsertMonthlySnapshot).toHaveBeenCalledWith(DB, {
      businessId: BUSINESS,
      service: "social",
      month: "2026-10-01",
      figures: {
        adSpendCents: 1_250_000,
        adBudgetCents: 1_500_000,
        adEnquiries: 9,
        postsPublished: 11,
        postsPlanned: 12,
        keywordsPageOne: null,
        keywordsPageOnePrev: null,
      },
      staffId: "staff-1",
      now: expect.any(Date),
    });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "numbers.save",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("saves Search figures", async () => {
    await expect(
      saveNumbersAction(form({ businessId: BUSINESS, service: "search", month: "2026-09", keywordsPageOne: "14", keywordsPageOnePrev: "" })),
    ).rejects.toThrow("?numbers=saved");
    expect(upsertMonthlySnapshot).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({ service: "search", month: "2026-09-01", figures: expect.objectContaining({ keywordsPageOne: 14, keywordsPageOnePrev: null }) }),
    );
  });

  it("calls nothing and redirects with invalid when a figure is not a whole number", async () => {
    await expect(saveNumbersAction(form({ ...SOCIAL, adEnquiries: "nine" }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?numbers=invalid#numbers`);
    expect(upsertMonthlySnapshot).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a service the business did not buy and saves nothing", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(saveNumbersAction(form(SOCIAL))).rejects.toThrow(`redirect:/clients/${BUSINESS}?numbers=not-bought#numbers`);
    expect(listBoughtServices).toHaveBeenCalledWith(DB, BUSINESS);
    expect(upsertMonthlySnapshot).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(saveNumbersAction(form({ ...SOCIAL, businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(upsertMonthlySnapshot).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(saveNumbersAction(form(SOCIAL))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});
