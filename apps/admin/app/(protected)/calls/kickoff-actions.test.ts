import { clearUnheldKickoffBooking, findSetupCallBooking, recordKickoffOutcome } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { completeKickoff } from "@/lib/server/kickoff-complete";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { completeKickoffAction, kickoffDidNotHappenAction, recordKickoffOutcomeAction } from "./kickoff-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, clearUnheldKickoffBooking: vi.fn(), findSetupCallBooking: vi.fn(), recordKickoffOutcome: vi.fn() };
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
  vi.mocked(completeKickoff).mockResolvedValue({ newlyHeld: true, buildStarted: true });
});

describe("completeKickoffAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(completeKickoffAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(completeKickoff).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(completeKickoffAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(completeKickoff).not.toHaveBeenCalled();
  });

  it("completes the kickoff with the trimmed notes, logs it and refreshes the page", async () => {
    await completeKickoffAction(form({ businessId: BUSINESS, notes: "  Five pages, call to book.  " }));
    expect(completeKickoff).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1", now: expect.any(Date), notes: "Five pages, call to book." });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "setup_call.held", businessId: BUSINESS }));
    expect(revalidatePath).toHaveBeenCalledWith("/calls");
  });

  it("completes with no notes when the box is empty", async () => {
    await completeKickoffAction(form({ businessId: BUSINESS, notes: "   " }));
    expect(completeKickoff).toHaveBeenCalledWith(DB, expect.objectContaining({ notes: null }));
  });

  it("refuses notes the database would refuse, before saving anything", async () => {
    await expect(completeKickoffAction(form({ businessId: BUSINESS, notes: "ok" }))).rejects.toThrow("3 to 600");
    await expect(completeKickoffAction(form({ businessId: BUSINESS, notes: "x".repeat(601) }))).rejects.toThrow("3 to 600");
    expect(completeKickoff).not.toHaveBeenCalled();
  });

  it("writes no log line when the call was already held", async () => {
    vi.mocked(completeKickoff).mockResolvedValue({ newlyHeld: false, buildStarted: false });
    await completeKickoffAction(form({ businessId: BUSINESS }));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });
});

describe("recordKickoffOutcomeAction", () => {
  const BOOKING = { startsAt: new Date("2026-10-30T10:00:00.000Z"), endsAt: new Date("2026-10-30T10:30:00.000Z") };

  beforeEach(() => {
    vi.mocked(findSetupCallBooking).mockResolvedValue(BOOKING as never);
    vi.mocked(clearUnheldKickoffBooking).mockResolvedValue(true);
  });

  it.each([
    ["customer_no_show", "setup_call.customer_no_show"],
    ["team_no_show", "setup_call.team_no_show"],
    ["rescheduled", "setup_call.rescheduled"],
  ])("records %s with the booking's times and no note, forgets the booking and logs %s", async (outcome, action) => {
    await recordKickoffOutcomeAction(form({ businessId: BUSINESS, outcome }));
    expect(recordKickoffOutcome).toHaveBeenCalledWith(DB, {
      businessId: BUSINESS,
      outcome,
      note: null,
      startsAt: BOOKING.startsAt,
      endsAt: BOOKING.endsAt,
      staffId: "staff-1",
      now: expect.any(Date),
    });
    expect(clearUnheldKickoffBooking).toHaveBeenCalledWith(DB, BUSINESS);
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action, targetId: BUSINESS, businessId: BUSINESS }));
    expect(revalidatePath).toHaveBeenCalledWith("/calls");
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it.each([["completed"], ["unknown"], [""], [null]])("refuses the outcome %p before recording anything", async (outcome) => {
    const data = new FormData();
    data.set("businessId", BUSINESS);
    if (outcome !== null) data.set("outcome", outcome);
    await expect(recordKickoffOutcomeAction(data)).rejects.toThrow();
    expect(recordKickoffOutcome).not.toHaveBeenCalled();
    expect(clearUnheldKickoffBooking).not.toHaveBeenCalled();
  });

  it("records and logs nothing when the booking was held and so not forgotten", async () => {
    vi.mocked(clearUnheldKickoffBooking).mockResolvedValue(false);
    await recordKickoffOutcomeAction(form({ businessId: BUSINESS, outcome: "customer_no_show" }));
    expect(recordKickoffOutcome).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });
});

describe("kickoffDidNotHappenAction", () => {
  it("forgets the booking and logs it", async () => {
    vi.mocked(clearUnheldKickoffBooking).mockResolvedValue(true);
    await kickoffDidNotHappenAction(form({ businessId: BUSINESS }));
    expect(clearUnheldKickoffBooking).toHaveBeenCalledWith(DB, BUSINESS);
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "setup_call.no_show", businessId: BUSINESS }));
  });

  it("logs nothing when there was no unheld booking to forget", async () => {
    vi.mocked(clearUnheldKickoffBooking).mockResolvedValue(false);
    await kickoffDidNotHappenAction(form({ businessId: BUSINESS }));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });
});
