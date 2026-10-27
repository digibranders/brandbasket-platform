import { describe, expect, it } from "vitest";
import { CALL_NOTICES, callNoticeLine, callRowsFor, readCallsNotice, readSummary } from "./call-form";

describe("readSummary", () => {
  it("trims what staff wrote", () => {
    expect(readSummary("  Brighter photos, add Saturday timings, go live on the 5th  ")).toEqual({ ok: true, summary: "Brighter photos, add Saturday timings, go live on the 5th" });
  });

  it("reads an empty box as clearing the summary", () => {
    expect(readSummary("")).toEqual({ ok: true, summary: null });
    expect(readSummary("   ")).toEqual({ ok: true, summary: null });
    expect(readSummary(null)).toEqual({ ok: true, summary: null });
  });

  it("refuses a summary shorter than 3 or longer than 600 characters, and anything that is not text", () => {
    expect(readSummary("ok")).toEqual({ ok: false });
    expect(readSummary("x".repeat(601))).toEqual({ ok: false });
    expect(readSummary("x".repeat(600))).toMatchObject({ ok: true });
    expect(readSummary(42)).toEqual({ ok: false });
  });
});

describe("the notice above the Calls section", () => {
  it("reads the words the actions put in the address, and nothing else", () => {
    expect(readCallsNotice("held")).toBe("held");
    expect(readCallsNotice("gone")).toBe("gone");
    expect(readCallsNotice("toString")).toBeNull();
    expect(readCallsNotice(["held"])).toBeNull();
    expect(readCallsNotice(undefined)).toBeNull();
  });

  it("says what happened, and says the customer can read a saved summary", () => {
    expect(callNoticeLine("saved")).toEqual({ ok: true, text: CALL_NOTICES.saved.text });
    expect(CALL_NOTICES.saved.text).toContain("Calls page");
    expect(callNoticeLine("invalid").ok).toBe(false);
    expect(callNoticeLine("gone").ok).toBe(false);
  });
});

describe("callRowsFor", () => {
  // Wed 2 Dec 2026, 15:00 in India.
  const NOW = new Date("2026-12-02T09:30:00.000Z");
  const call = (overrides: Record<string, unknown>) =>
    ({
      id: "call-1",
      reason: "social",
      note: "Ads for braces",
      status: "booked",
      source: "dashboard",
      startsAt: new Date("2026-12-02T08:30:00.000Z"),
      endsAt: new Date("2026-12-02T09:00:00.000Z"),
      summary: null,
      ...overrides,
    }) as never;

  it("offers Mark as held on a booked call that has started, and says a call still ahead has not started", () => {
    const rows = callRowsFor({ calls: [call({}), call({ id: "call-2", startsAt: new Date("2026-12-09T08:30:00.000Z"), endsAt: new Date("2026-12-09T09:00:00.000Z") })], kickoff: null, now: NOW });
    expect(rows.map((row) => row.key)).toEqual(["call-2", "call-1"]);
    expect(rows[1]).toMatchObject({ key: "call-1", about: "Social & Ads", status: "Booked", canMarkHeld: true, canUndo: false, canWrite: false, note: "Ads for braces" });
    expect(rows[0]).toMatchObject({ key: "call-2", status: "Booked, not started", canMarkHeld: false });
  });

  it("lets staff write what was agreed on a held call, and undo the mark", () => {
    const [row] = callRowsFor({ calls: [call({ status: "held", summary: "Try braces ads in January" })], kickoff: null, now: NOW });
    expect(row).toMatchObject({ status: "Held", canMarkHeld: false, canUndo: true, canWrite: true, summary: "Try braces ads in January" });
  });

  it("shows a cancelled call with nothing to do", () => {
    const [row] = callRowsFor({ calls: [call({ status: "cancelled" })], kickoff: null, now: NOW });
    expect(row).toMatchObject({ status: "Cancelled", canMarkHeld: false, canUndo: false, canWrite: false });
  });

  it("says when a call was booked on Cal.com's page", () => {
    const [row] = callRowsFor({ calls: [call({ source: "booking_page" })], kickoff: null, now: NOW });
    expect(row?.from).toBe("Cal.com page");
    expect(callRowsFor({ calls: [call({})], kickoff: null, now: NOW })[0]?.from).toBe("Dashboard");
  });

  it("adds the kickoff call only once it is held, because marking it held is the kickoff section's job", () => {
    const held = { startsAt: new Date("2026-10-27T08:30:00.000Z"), heldAt: new Date("2026-10-27T09:10:00.000Z"), summary: "6 pages in blue and white" } as never;
    const [first, second] = callRowsFor({ calls: [call({})], kickoff: held, now: NOW });
    expect(first).toMatchObject({ key: "call-1" });
    expect(second).toMatchObject({ key: "kickoff", about: "Kickoff", status: "Held", canMarkHeld: false, canUndo: false, canWrite: true, summary: "6 pages in blue and white" });
    expect(callRowsFor({ calls: [], kickoff: { startsAt: null, heldAt: null, summary: null } as never, now: NOW })).toEqual([]);
  });
});
