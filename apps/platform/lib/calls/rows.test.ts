import { describe, expect, it } from "vitest";
import { callRows, MAX_UPCOMING_CALLS, nextCallLine, upcomingCount, type CallInput } from "./rows";

// Tue 1 Dec 2026, 12:00 in India.
const NOW = new Date("2026-12-01T06:30:00.000Z");

function call(overrides: Partial<CallInput> & Pick<CallInput, "id">): CallInput {
  return {
    reason: "social",
    note: null,
    startsAt: new Date("2026-12-02T08:30:00.000Z"),
    endsAt: new Date("2026-12-02T09:00:00.000Z"),
    status: "booked",
    summary: null,
    ...overrides,
  };
}

describe("callRows", () => {
  it("splits calls still to come from calls that are over, soonest first and newest first", () => {
    const { upcoming, past } = callRows({
      calls: [
        call({ id: "later", startsAt: new Date("2026-12-09T08:30:00.000Z"), endsAt: new Date("2026-12-09T09:00:00.000Z") }),
        call({ id: "soon" }),
        call({ id: "old-1", status: "held", reason: "website", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z"), summary: "Brighter photos" }),
        call({ id: "old-2", status: "held", reason: "billing", startsAt: new Date("2026-11-20T11:00:00.000Z"), endsAt: new Date("2026-11-20T11:30:00.000Z") }),
      ],
      kickoff: null,
      now: NOW,
    });
    expect(upcoming.map((row) => row.key)).toEqual(["soon", "later"]);
    expect(past.map((row) => row.key)).toEqual(["old-2", "old-1"]);
  });

  it("writes the time in India, the reason in the customer's words, and lets only a call still ahead be changed or cancelled", () => {
    const { upcoming } = callRows({ calls: [call({ id: "soon", reason: "other" })], kickoff: null, now: NOW });
    expect(upcoming[0]).toMatchObject({ about: "Something else", when: "Wed 2 Dec, 14:00", canChange: true, canCancel: true, callId: "soon" });
    const underway = callRows({ calls: [call({ id: "now", startsAt: new Date("2026-12-01T06:00:00.000Z"), endsAt: new Date("2026-12-01T06:45:00.000Z") })], kickoff: null, now: NOW });
    expect(underway.upcoming[0]).toMatchObject({ canChange: false, canCancel: false });
  });

  it("keeps the reason and the note, so changing the call's time starts from them", () => {
    const { upcoming } = callRows({ calls: [call({ id: "soon", reason: "billing", note: "About my invoice" })], kickoff: null, now: NOW });
    expect(upcoming[0]).toMatchObject({ reason: "billing", note: "About my invoice" });
  });

  it("leaves a cancelled call out", () => {
    const { upcoming, past } = callRows({ calls: [call({ id: "gone", status: "cancelled" })], kickoff: null, now: NOW });
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });

  it("shows what was agreed only for a call that was held", () => {
    const { past } = callRows({
      calls: [
        call({ id: "held", status: "held", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z"), summary: "Add Saturday timings" }),
        call({ id: "unmarked", status: "booked", startsAt: new Date("2026-11-04T11:00:00.000Z"), endsAt: new Date("2026-11-04T11:30:00.000Z"), summary: "Never shown" }),
      ],
      kickoff: null,
      now: NOW,
    });
    expect(past.find((row) => row.key === "held")?.agreed).toBe("Add Saturday timings");
    expect(past.find((row) => row.key === "unmarked")?.agreed).toBeNull();
  });

  it("adds the kickoff call as a row that cannot be changed here", () => {
    const kickoff = { startsAt: new Date("2026-10-27T08:30:00.000Z"), endsAt: new Date("2026-10-27T09:00:00.000Z"), heldAt: new Date("2026-10-27T09:10:00.000Z"), summary: "6 pages in blue and white" };
    const { past } = callRows({ calls: [], kickoff, now: NOW });
    expect(past).toEqual([
      {
        key: "kickoff",
        callId: null,
        about: "Kickoff",
        reason: null,
        note: null,
        when: "Tue 27 Oct, 14:00",
        startsAtIso: "2026-10-27T08:30:00.000Z",
        endsAtIso: "2026-10-27T09:00:00.000Z",
        agreed: "6 pages in blue and white",
        canChange: false,
        canCancel: false,
      },
    ]);
  });

  it("leaves the kickoff out when it was never booked through the dashboard, and shows a booked one still ahead as upcoming", () => {
    expect(callRows({ calls: [], kickoff: { startsAt: null, endsAt: null, heldAt: new Date("2026-10-27T09:10:00.000Z"), summary: "x" }, now: NOW })).toEqual({ upcoming: [], past: [] });
    const ahead = callRows({ calls: [], kickoff: { startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z"), heldAt: null, summary: null }, now: NOW });
    expect(ahead.upcoming.map((row) => row.key)).toEqual(["kickoff"]);
    expect(ahead.upcoming[0]?.agreed).toBeNull();
  });
});

describe("upcomingCount and the limit", () => {
  it("counts booked calls that have not ended, and can leave out the one being changed", () => {
    const calls = [call({ id: "a" }), call({ id: "b" }), call({ id: "c", status: "cancelled" }), call({ id: "d", status: "held", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z") })];
    expect(upcomingCount(calls, NOW)).toBe(2);
    expect(upcomingCount(calls, NOW, "a")).toBe(1);
    expect(MAX_UPCOMING_CALLS).toBe(3);
  });
});

describe("nextCallLine", () => {
  it("is the time of the soonest call, or null when none is booked", () => {
    const { upcoming } = callRows({ calls: [call({ id: "later", startsAt: new Date("2026-12-09T08:30:00.000Z"), endsAt: new Date("2026-12-09T09:00:00.000Z") }), call({ id: "soon" })], kickoff: null, now: NOW });
    expect(nextCallLine(upcoming)).toBe("Wed 2 Dec, 14:00");
    expect(nextCallLine([])).toBeNull();
  });
});
