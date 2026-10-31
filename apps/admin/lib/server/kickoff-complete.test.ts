import { addActivityEvent, findLatestKickoffOutcome, findSetupCallBooking, markProjectReadyAfterKickoff, markSetupCallHeld, recordKickoffOutcome, saveSetupCallSummary } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeKickoff } from "./kickoff-complete";

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    addActivityEvent: vi.fn(),
    findLatestKickoffOutcome: vi.fn(),
    findSetupCallBooking: vi.fn(),
    markProjectReadyAfterKickoff: vi.fn(),
    markSetupCallHeld: vi.fn(),
    recordKickoffOutcome: vi.fn(),
    saveSetupCallSummary: vi.fn(),
  };
});

const DB = { db: true } as never;
const NOW = new Date("2026-10-30T12:00:00.000Z");
const INPUT = { businessId: "b-1", staffId: "staff-1", now: NOW, notes: null };
const BOOKING = { startsAt: new Date("2026-10-30T10:00:00.000Z"), endsAt: new Date("2026-10-30T10:30:00.000Z") };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(findLatestKickoffOutcome).mockResolvedValue(null);
  vi.mocked(markProjectReadyAfterKickoff).mockResolvedValue(true);
});

describe("completeKickoff", () => {
  it("marks a call held, readies the build 48 hours on, and tells the customer", async () => {
    const result = await completeKickoff(DB, INPUT);
    expect(markSetupCallHeld).toHaveBeenCalledWith(DB, { businessId: "b-1", staffId: "staff-1", now: NOW });
    expect(markProjectReadyAfterKickoff).toHaveBeenCalledWith(DB, { businessId: "b-1", dueAt: new Date("2026-11-01T12:00:00.000Z"), now: NOW });
    expect(addActivityEvent).toHaveBeenCalledWith(DB, expect.objectContaining({ businessId: "b-1", service: "website", title: "Kickoff call completed", staffId: "staff-1" }));
    expect(result).toEqual({ newlyHeld: true, buildStarted: true });
  });

  it("saves the notes when there are some, and not otherwise", async () => {
    await completeKickoff(DB, INPUT);
    expect(saveSetupCallSummary).not.toHaveBeenCalled();
    await completeKickoff(DB, { ...INPUT, notes: "Five pages, call to book." });
    expect(saveSetupCallSummary).toHaveBeenCalledWith(DB, { businessId: "b-1", staffId: "staff-1", summary: "Five pages, call to book.", now: NOW });
  });

  it("keeps the first held time of a call that is already held, and counts the preview from it", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ heldAt: new Date("2026-10-30T10:00:00.000Z"), endsAt: new Date("2026-10-30T09:00:00.000Z") } as never);
    await completeKickoff(DB, INPUT);
    expect(markSetupCallHeld).not.toHaveBeenCalled();
    expect((await completeKickoff(DB, INPUT)).newlyHeld).toBe(false);
    expect(markProjectReadyAfterKickoff).toHaveBeenCalledWith(DB, expect.objectContaining({ dueAt: new Date("2026-11-01T10:00:00.000Z") }));
  });

  it("writes no activity line when no build started (a plan without the website, or a build already under way)", async () => {
    vi.mocked(markProjectReadyAfterKickoff).mockResolvedValue(false);
    expect(await completeKickoff(DB, INPUT)).toEqual({ newlyHeld: true, buildStarted: false });
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("records a completed outcome with the booking's times when no outcome is recorded yet", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue(BOOKING as never);
    await completeKickoff(DB, INPUT);
    expect(recordKickoffOutcome).toHaveBeenCalledWith(DB, {
      businessId: "b-1",
      outcome: "completed",
      note: null,
      startsAt: BOOKING.startsAt,
      endsAt: BOOKING.endsAt,
      staffId: "staff-1",
      now: NOW,
    });
  });

  it("records no outcome when the latest one is already completed", async () => {
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue({ outcome: "completed", note: null, recordedAt: NOW, recordedByStaffId: "staff-1" });
    await completeKickoff(DB, INPUT);
    expect(recordKickoffOutcome).not.toHaveBeenCalled();
  });

  it("records completed again after a call was rescheduled and then held", async () => {
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue({ outcome: "rescheduled", note: null, recordedAt: NOW, recordedByStaffId: "staff-1" });
    await completeKickoff(DB, INPUT);
    expect(recordKickoffOutcome).toHaveBeenCalledWith(DB, expect.objectContaining({ outcome: "completed", startsAt: null, endsAt: null }));
  });
});
