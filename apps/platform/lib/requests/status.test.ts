import type { ChangeEventView, ChangeView } from "@brandbasket/db";
import type { ChangeState } from "@brandbasket/db/change-states";
import { describe, expect, it } from "vitest";
import { canReopen, nextStep, readyByDay, stepperRows } from "./status";

const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };

function change(overrides: Partial<ChangeView> = {}): ChangeView {
  return {
    id: "request-1",
    ticketId: "ticket-1",
    businessId: "business-1",
    kind: "website",
    page: "Home",
    state: "requested",
    coverage: "undecided",
    quote: null,
    acceptedAt: null,
    chargeId: null,
    chargeStatus: null,
    closedReason: null,
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    updatedAt: new Date("2026-11-27T12:30:00.000Z"),
    ...overrides,
  };
}

const at = (state: ChangeState, iso: string): ChangeEventView => ({ state, at: new Date(iso) });
const NOW = new Date("2026-11-26T05:00:00.000Z");
// Thursday 26 November 2026 in India.
const TODAY = "2026-11-26";

describe("stepperRows", () => {
  it("shows the quote as where the request is, with the dates behind it and nothing ahead", () => {
    const rows = stepperRows(change({ state: "quoted", coverage: "paid", quote: QUOTE }), [at("requested", "2026-11-27T12:30:00.000Z"), at("quoted", "2026-11-28T04:50:00.000Z")]);
    expect(rows).toEqual([
      { label: "Sent", mark: "done", note: "27 Nov" },
      { label: "Quoted", mark: "now", note: "28 Nov" },
      { label: "In progress", mark: "todo", note: null },
      { label: "Ready to check", mark: "todo", note: null },
      { label: "Done", mark: "todo", note: null },
    ]);
  });

  it("says Included where an included edit has no quote", () => {
    const rows = stepperRows(change({ state: "in_progress", coverage: "included" }), [at("requested", "2026-11-27T12:30:00.000Z"), at("in_progress", "2026-11-28T04:50:00.000Z")]);
    expect(rows?.map((row) => [row.label, row.mark, row.note])).toEqual([
      ["Sent", "done", "27 Nov"],
      ["Quoted", "done", "Included"],
      ["In progress", "now", "28 Nov"],
      ["Ready to check", "todo", null],
      ["Done", "todo", null],
    ]);
  });

  it("marks every step done when the change is done, with the first date each was reached", () => {
    const rows = stepperRows(change({ state: "shipped", coverage: "paid", quote: QUOTE }), [
      at("requested", "2026-11-27T12:30:00.000Z"),
      at("quoted", "2026-11-28T04:50:00.000Z"),
      at("in_progress", "2026-11-30T04:50:00.000Z"),
      at("preview", "2026-12-02T04:50:00.000Z"),
      at("revisions", "2026-12-02T08:50:00.000Z"),
      at("preview", "2026-12-03T04:50:00.000Z"),
      at("approved", "2026-12-03T06:50:00.000Z"),
      at("shipped", "2026-12-04T06:50:00.000Z"),
    ]);
    expect(rows?.map((row) => [row.mark, row.note])).toEqual([
      ["done", "27 Nov"],
      ["done", "28 Nov"],
      ["done", "30 Nov"],
      ["done", "2 Dec"],
      ["done", "3 Dec"],
    ]);
  });

  it("goes back a step when a fix is asked for, and hides the dates it has not reached again", () => {
    const rows = stepperRows(change({ state: "revisions", coverage: "free" }), [
      at("requested", "2026-11-27T12:30:00.000Z"),
      at("in_progress", "2026-11-28T04:50:00.000Z"),
      at("preview", "2026-11-30T04:50:00.000Z"),
      at("revisions", "2026-11-30T08:50:00.000Z"),
    ]);
    expect(rows?.map((row) => [row.label, row.mark, row.note])).toEqual([
      ["Sent", "done", "27 Nov"],
      ["Quoted", "done", "Included"],
      ["In progress", "now", "28 Nov"],
      ["Ready to check", "todo", null],
      ["Done", "todo", null],
    ]);
  });

  it("has no steps for a request that ended without the change", () => {
    expect(stepperRows(change({ state: "declined" }), [])).toBeNull();
    expect(stepperRows(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [])).toBeNull();
  });
});

describe("readyByDay", () => {
  it("promises a quote's working days from today", () => {
    expect(readyByDay(change({ state: "quoted", coverage: "paid", quote: QUOTE }), TODAY)).toBe("2026-12-03");
  });

  it("promises paid work from the day the customer said yes, counted in India", () => {
    // 23:00 UTC on Mon 30 Nov is 04:30 on Tue 1 Dec in India; three working days on is Fri 4 Dec.
    expect(readyByDay(change({ state: "in_progress", coverage: "paid", quote: { ...QUOTE, workingDays: 3 }, acceptedAt: new Date("2026-11-30T23:00:00.000Z") }), TODAY)).toBe("2026-12-04");
  });

  it("promises an included edit two working days from the day it was sent, skipping the weekend", () => {
    // Fri 27 Nov 18:00 in India, so Mon 30 Nov and Tue 1 Dec.
    expect(readyByDay(change({ state: "in_progress", coverage: "included", createdAt: new Date("2026-11-27T12:30:00.000Z") }), TODAY)).toBe("2026-12-01");
  });

  it("promises nothing at any other point", () => {
    for (const state of ["requested", "revisions", "preview", "approved", "shipped", "declined", "withdrawn"] as const) {
      expect(readyByDay(change({ state }), TODAY)).toBeNull();
    }
  });
});

describe("canReopen", () => {
  const shippedAt = (iso: string) => [at("shipped", iso)];

  it("lets a finished change be reopened for 14 days, and not after", () => {
    const now = new Date("2026-12-18T05:00:00.000Z");
    expect(canReopen(change({ state: "shipped" }), shippedAt("2026-12-04T05:00:00.000Z"), now)).toBe(true);
    expect(canReopen(change({ state: "shipped" }), shippedAt("2026-12-04T04:59:59.000Z"), now)).toBe(false);
  });

  it("reopens an approved change and a quote that was turned down, but not one that was never quoted", () => {
    const now = new Date("2026-12-05T05:00:00.000Z");
    expect(canReopen(change({ state: "approved" }), [at("approved", "2026-12-04T05:00:00.000Z")], now)).toBe(true);
    expect(canReopen(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [at("withdrawn", "2026-12-04T05:00:00.000Z")], now)).toBe(true);
    expect(canReopen(change({ state: "withdrawn", coverage: "undecided" }), [at("withdrawn", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
  });

  it("does not reopen a change that is still going, or one the team declined", () => {
    const now = new Date("2026-12-05T05:00:00.000Z");
    expect(canReopen(change({ state: "in_progress" }), [at("in_progress", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
    expect(canReopen(change({ state: "declined" }), [at("declined", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
  });

  it("counts from the last time it reached the state it is in", () => {
    const now = new Date("2026-12-20T05:00:00.000Z");
    const events = [at("shipped", "2026-12-01T05:00:00.000Z"), at("revisions", "2026-12-02T05:00:00.000Z"), at("shipped", "2026-12-10T05:00:00.000Z")];
    expect(canReopen(change({ state: "shipped" }), events, now)).toBe(true);
  });
});

describe("nextStep", () => {
  const events: ChangeEventView[] = [];

  it("asks for the customer's OK on a quote, with the price, the date it unlocks and the one dark button", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE }), events, TODAY, NOW);
    expect(step).toEqual({
      title: "Waiting for you",
      text: "This is more than an included 15 minute edit, so it needs your OK first. Accept today and it is ready to check by Thu 3 Dec.",
      quote: { line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500" },
      action: { kind: "accept", label: "Accept and pay ₹1,500" },
      secondary: { kind: "decline", label: "Not now" },
    });
  });

  it("asks for the payment once the quote is accepted and the charge is open, and offers no way back", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: NOW, chargeId: "charge-1", chargeStatus: "open" }), events, TODAY, NOW);
    expect(step.title).toBe("Waiting for your payment");
    expect(step.action).toEqual({ kind: "pay", label: "Pay ₹1,500", chargeId: "charge-1" });
    expect(step.secondary).toBeNull();
  });

  it("asks to accept again when the charge it opened was waived", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: NOW, chargeId: "charge-1", chargeStatus: "waived" }), events, TODAY, NOW);
    expect(step.action?.kind).toBe("accept");
  });

  it("promises a date while the work goes on, and asks for the customer's look when it is ready", () => {
    const working = nextStep(change({ state: "in_progress", coverage: "included", createdAt: new Date("2026-11-27T12:30:00.000Z") }), events, TODAY, NOW);
    expect(working.text).toBe("It will be ready to check by Tue 1 Dec.");
    expect(working.action).toBeNull();
    const ready = nextStep(change({ state: "preview" }), events, TODAY, NOW);
    expect(ready.action).toEqual({ kind: "approve", label: "Looks good" });
  });

  it("says plainly what happened to a finished, declined or turned-down request", () => {
    const done = nextStep(change({ state: "shipped" }), [at("shipped", "2026-11-25T05:00:00.000Z")], TODAY, NOW);
    expect(done).toMatchObject({ title: "Done", text: "This change is live.", secondary: { kind: "reopen", label: "Reopen this change" } });
    const declined = nextStep(change({ state: "declined", closedReason: "We do not build online shops." }), events, TODAY, NOW);
    expect(declined).toMatchObject({ title: "We could not take this on", text: "We do not build online shops.", action: null, secondary: null });
    const withdrawn = nextStep(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [at("withdrawn", "2026-11-25T05:00:00.000Z")], TODAY, NOW);
    expect(withdrawn).toMatchObject({ title: "You chose not to go ahead", secondary: { kind: "reopen", label: "Reopen the quote" } });
  });

  it("never uses a dash in what it says", () => {
    const states: ChangeState[] = ["requested", "quoted", "in_progress", "preview", "revisions", "approved", "shipped", "declined", "withdrawn"];
    for (const state of states) {
      const step = nextStep(change({ state, coverage: "paid", quote: QUOTE, closedReason: "Not for us." }), [at(state, "2026-11-25T05:00:00.000Z")], TODAY, NOW);
      expect(JSON.stringify(step)).not.toMatch(/[–—]/);
    }
  });
});
