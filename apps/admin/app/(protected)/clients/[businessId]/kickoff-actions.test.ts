import { clearSetupCallHeld, markSetupCallHeld } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { markCallHeldAction, undoCallHeldAction } from "./kickoff-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, markSetupCallHeld: vi.fn(), clearSetupCallHeld: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("markCallHeldAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(markCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(markSetupCallHeld).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(markCallHeldAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(markSetupCallHeld).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("marks the call as the signed-in staff member, logs it and returns to the section", async () => {
    await expect(markCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}#kickoff-call`);
    expect(markSetupCallHeld).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1", now: expect.any(Date) });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "setup_call.held",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(markCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("undoCallHeldAction", () => {
  it("throws on a business id that is not an id", async () => {
    await expect(undoCallHeldAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(clearSetupCallHeld).not.toHaveBeenCalled();
  });

  it("clears the mark, logs it and returns to the section", async () => {
    await expect(undoCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}#kickoff-call`);
    expect(clearSetupCallHeld).toHaveBeenCalledWith(DB, BUSINESS, expect.any(Date));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "setup_call.unheld",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("lets an access log failure propagate", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(undoCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
  });
});
