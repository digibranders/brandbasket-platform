import { extendAccountClosure, renameBusinessOwner, restoreAccountClosureForBusiness } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { extendClosureAction, renameOwnerAction, restoreClosureAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ renameBusinessOwner: vi.fn(), restoreAccountClosureForBusiness: vi.fn(), extendAccountClosure: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "admin" } } as unknown as GrantedStaff;
const DB = { name: "staff-db" };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(requireStaffCan).mockResolvedValue(STAFF);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("renameOwnerAction", () => {
  it("saves a trimmed name, records it without the name, and says so", async () => {
    vi.mocked(renameBusinessOwner).mockResolvedValue(true);
    await expect(renameOwnerAction(form({ businessId: BUSINESS, userId: "owner-1", name: "  Vikram Rao  " }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/people?people=renamed`);
    expect(renameBusinessOwner).toHaveBeenCalledWith(DB, { businessId: BUSINESS, userId: "owner-1", name: "Vikram Rao" });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: BUSINESS, kind: "people.owner_renamed", summary: "Changed the owner's name", data: { userId: "owner-1" } });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`, "layout");
  });

  it("refuses an empty or overlong name without writing", async () => {
    await expect(renameOwnerAction(form({ businessId: BUSINESS, userId: "owner-1", name: "   " }))).rejects.toThrow("people=invalid-name");
    await expect(renameOwnerAction(form({ businessId: BUSINESS, userId: "owner-1", name: "x".repeat(61) }))).rejects.toThrow("people=invalid-name");
    expect(renameBusinessOwner).not.toHaveBeenCalled();
  });

  it("says so when the person is not an owner", async () => {
    vi.mocked(renameBusinessOwner).mockResolvedValue(false);
    await expect(renameOwnerAction(form({ businessId: BUSINESS, userId: "editor-1", name: "Sam" }))).rejects.toThrow("people=not-owner");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not one", async () => {
    await expect(renameOwnerAction(form({ businessId: "nope", userId: "owner-1", name: "Sam" }))).rejects.toThrow("must be a valid id");
  });
});

describe("restoreClosureAction", () => {
  it("is admin only, restores, logs the access and records the action", async () => {
    vi.mocked(restoreAccountClosureForBusiness).mockResolvedValue(true);
    await expect(restoreClosureAction(form({ businessId: BUSINESS }))).rejects.toThrow("people=restored");
    expect(requireStaffCan).toHaveBeenCalledWith("oversight");
    expect(restoreAccountClosureForBusiness).toHaveBeenCalledWith(DB, { businessId: BUSINESS, now: expect.any(Date) });
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "client.closure_restore", targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: BUSINESS, kind: "account.restored", summary: "Restored the account" });
  });

  it("says nothing changed when the account is not leaving", async () => {
    vi.mocked(restoreAccountClosureForBusiness).mockResolvedValue(false);
    await expect(restoreClosureAction(form({ businessId: BUSINESS }))).rejects.toThrow("people=no-closure");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("extendClosureAction", () => {
  it("is admin only and moves the erase date 30 days", async () => {
    vi.mocked(extendAccountClosure).mockResolvedValue(true);
    await expect(extendClosureAction(form({ businessId: BUSINESS }))).rejects.toThrow("people=extended");
    expect(requireStaffCan).toHaveBeenCalledWith("oversight");
    expect(extendAccountClosure).toHaveBeenCalledWith(DB, { businessId: BUSINESS, days: 30 });
    expect(logStaffAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "client.closure_extend", businessId: BUSINESS }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: BUSINESS, kind: "account.erase_extended", summary: "Moved the erase date 30 days later" });
  });
});
