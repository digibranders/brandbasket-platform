import { clearTeamCallHeld, markTeamCallHeld, saveSetupCallSummary, saveTeamCallSummary } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { markTeamCallHeldAction, saveCallSummaryAction, undoTeamCallHeldAction } from "./call-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, markTeamCallHeld: vi.fn(), clearTeamCallHeld: vi.fn(), saveTeamCallSummary: vi.fn(), saveSetupCallSummary: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const CALL = "01a0f71b-8402-7d48-a90a-207e8c8a8830";
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

describe("markTeamCallHeldAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(markTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow("NEXT_REDIRECT");
    expect(markTeamCallHeld).not.toHaveBeenCalled();
  });

  it("throws on a business or call that is not an id", async () => {
    await expect(markTeamCallHeldAction(form({ businessId: "x", callId: CALL }))).rejects.toThrow("must be a valid id");
    await expect(markTeamCallHeldAction(form({ businessId: BUSINESS, callId: "kickoff" }))).rejects.toThrow("must be a valid id");
    expect(markTeamCallHeld).not.toHaveBeenCalled();
  });

  it("marks the call as the signed-in staff member, logs it and returns to the section with a notice", async () => {
    vi.mocked(markTeamCallHeld).mockResolvedValue(true);
    await expect(markTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?calls=held#calls`);
    expect(markTeamCallHeld).toHaveBeenCalledWith(DB, { id: CALL, businessId: BUSINESS, staffId: "staff-1", now: expect.any(Date) });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "team_call.held", targetType: "team_call", targetId: CALL, businessId: BUSINESS });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("writes no log entry, and says the call has changed, when it was not marked", async () => {
    vi.mocked(markTeamCallHeld).mockResolvedValue(false);
    await expect(markTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?calls=gone#calls`);
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(markTeamCallHeld).mockResolvedValue(true);
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(markTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("undoTeamCallHeldAction", () => {
  it("clears the mark, logs it and returns to the section", async () => {
    vi.mocked(clearTeamCallHeld).mockResolvedValue(true);
    await expect(undoTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?calls=undone#calls`);
    expect(clearTeamCallHeld).toHaveBeenCalledWith(DB, { id: CALL, businessId: BUSINESS, now: expect.any(Date) });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "team_call.unheld", targetType: "team_call", targetId: CALL, businessId: BUSINESS });
  });

  it("writes no log entry when there was no mark to clear", async () => {
    vi.mocked(clearTeamCallHeld).mockResolvedValue(false);
    await expect(undoTeamCallHeldAction(form({ businessId: BUSINESS, callId: CALL }))).rejects.toThrow("?calls=gone#calls");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });
});

describe("saveCallSummaryAction", () => {
  it("saves what was agreed on a call after the kickoff, and logs it", async () => {
    vi.mocked(saveTeamCallSummary).mockResolvedValue(true);
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "  Try braces ads in January  " }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?calls=saved#calls`);
    expect(saveTeamCallSummary).toHaveBeenCalledWith(DB, { id: CALL, businessId: BUSINESS, staffId: "staff-1", summary: "Try braces ads in January", now: expect.any(Date) });
    expect(saveSetupCallSummary).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "call.summary", targetType: "team_call", targetId: CALL, businessId: BUSINESS });
  });

  it("saves what was agreed on the kickoff call through its own query", async () => {
    vi.mocked(saveSetupCallSummary).mockResolvedValue(true);
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: "kickoff", summary: "6 pages in blue and white" }))).rejects.toThrow("?calls=saved#calls");
    expect(saveSetupCallSummary).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1", summary: "6 pages in blue and white", now: expect.any(Date) });
    expect(saveTeamCallSummary).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "call.summary", targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
  });

  it("clears the summary when the box is empty", async () => {
    vi.mocked(saveTeamCallSummary).mockResolvedValue(true);
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "  " }))).rejects.toThrow("?calls=cleared#calls");
    expect(saveTeamCallSummary).toHaveBeenCalledWith(DB, expect.objectContaining({ summary: null }));
  });

  it("saves nothing, and says why, for a summary that is too short or too long", async () => {
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "ok" }))).rejects.toThrow("?calls=invalid#calls");
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "x".repeat(601) }))).rejects.toThrow("?calls=invalid#calls");
    expect(saveTeamCallSummary).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("says the call has changed when it is not held any more", async () => {
    vi.mocked(saveTeamCallSummary).mockResolvedValue(false);
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "Try braces ads" }))).rejects.toThrow("?calls=gone#calls");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("is refused for a session that is not staff's, and for a call that is not an id", async () => {
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: "call-1", summary: "Try braces ads" }))).rejects.toThrow("must be a valid id");
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveCallSummaryAction(form({ businessId: BUSINESS, callId: CALL, summary: "Try braces ads" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(saveTeamCallSummary).not.toHaveBeenCalled();
  });
});
