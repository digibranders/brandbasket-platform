import { clearSetupCallHeld } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { completeKickoff } from "@/lib/server/kickoff-complete";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { markCallHeldAction, undoCallHeldAction } from "./kickoff-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, clearSetupCallHeld: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/kickoff-complete", () => ({ completeKickoff: vi.fn() }));

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
    expect(completeKickoff).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(markCallHeldAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(completeKickoff).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("completes the kickoff as the signed-in staff member, logs it and returns to the section", async () => {
    vi.mocked(completeKickoff).mockResolvedValue({ newlyHeld: true, buildStarted: true });
    await expect(markCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project#kickoff-call`);
    expect(completeKickoff).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1", now: expect.any(Date), notes: null });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "setup_call.held",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("writes no log entry, and still returns to the section, when the call was already held", async () => {
    vi.mocked(completeKickoff).mockResolvedValue({ newlyHeld: false, buildStarted: false });
    await expect(markCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project#kickoff-call`);
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(completeKickoff).mockResolvedValue({ newlyHeld: true, buildStarted: true });
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
    vi.mocked(clearSetupCallHeld).mockResolvedValue(true);
    await expect(undoCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project#kickoff-call`);
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

  it("writes no log entry, and still returns to the section, when there was no mark to clear", async () => {
    vi.mocked(clearSetupCallHeld).mockResolvedValue(false);
    await expect(undoCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project#kickoff-call`);
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate", async () => {
    vi.mocked(clearSetupCallHeld).mockResolvedValue(true);
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(undoCallHeldAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
  });
});
