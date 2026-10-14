import { describe, expect, it } from "vitest";
import { addOnActions, addOnView, decideAddOnCheckout, nextAddOnStatus, type AddOnFacts, type AddOnView } from "./add-on-state";
import { addOnFactsOf, pickAddOnRows } from "./add-on-rows";

type Row = AddOnFacts & { readonly id: string; readonly activatedAt: Date | null };

const PAID = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-11-01T00:00:00.000Z");

function row(id: string, overrides: Partial<Row> = {}): Row {
  return { id, status: "active", endKind: null, currentPeriodEnd: END, haltedAt: null, endedAt: null, startAt: null, activatedAt: PAID, ...overrides };
}

describe("pickAddOnRows", () => {
  it("finds nothing in an empty list", () => {
    expect(pickAddOnRows<Row>([])).toEqual({ incomplete: null, current: null, successor: null });
  });

  it("takes the newest row that is not an unpaid checkout as current, and the unpaid checkout apart", () => {
    const checkout = row("c", { status: "incomplete", activatedAt: null, currentPeriodEnd: null });
    const paused = row("p", { status: "cancelled", endKind: "pause" });

    expect(pickAddOnRows([checkout, paused])).toEqual({ incomplete: checkout, current: paused, successor: null });
  });

  it("skips a checkout that was cancelled before it was ever paid, so a paused add-on stays paused", () => {
    const abandoned = row("a", { status: "cancelled", activatedAt: null, currentPeriodEnd: null, endedAt: END });
    const paused = row("p", { status: "cancelled", endKind: "pause" });

    expect(pickAddOnRows([abandoned, paused]).current).toBe(paused);
  });

  it("finds no current row when every row was an abandoned checkout", () => {
    const abandoned = row("a", { status: "cancelled", activatedAt: null, currentPeriodEnd: null, endedAt: END });

    expect(pickAddOnRows([abandoned]).current).toBeNull();
  });

  it("names a kept subscription waiting to start as the successor, and still sees the ending row beneath it", () => {
    const kept = row("k", { status: "scheduled", activatedAt: null, currentPeriodEnd: null, startAt: END });
    const ending = row("e", { endKind: "cancel" });

    const picked = pickAddOnRows([kept, ending]);
    expect(picked.successor).toBe(kept);
    expect(picked.current).toBe(kept);
  });

  it("goes back to the ending row when the kept subscription was cancelled before its first charge", () => {
    const undone = row("k", { status: "cancelled", activatedAt: null, currentPeriodEnd: null, startAt: END, endedAt: PAID });
    const ending = row("e", { endKind: "cancel" });

    expect(pickAddOnRows([undone, ending])).toEqual({ incomplete: null, current: ending, successor: null });
  });
});

describe("addOnFactsOf", () => {
  it("narrows the stored end kind", () => {
    expect(addOnFactsOf({ ...row("a", { endKind: "pause" }), endKind: "pause" })).toEqual({
      status: "active",
      endKind: "pause",
      currentPeriodEnd: END,
      haltedAt: null,
      endedAt: null,
      startAt: null,
    });
  });

  it("refuses an end kind the database should never hold", () => {
    expect(() => addOnFactsOf({ ...row("a"), endKind: "stop" })).toThrow(RangeError);
  });
});

describe("a kept subscription whose first charge comes due", () => {
  const START_DAY = END;
  const NEXT_END = new Date("2026-12-01T00:00:00.000Z");
  const BEFORE = new Date("2026-10-20T00:00:00.000Z");
  const DUE = new Date("2026-11-01T00:00:05.000Z");

  /** The old row, set to cancel on START_DAY, and the kept row Razorpay has authorised to start that day. */
  const ending = (overrides: Partial<Row> = {}): Row => row("e", { endKind: "cancel", ...overrides });
  const kept = (overrides: Partial<Row> = {}): Row =>
    row("k", { status: "scheduled", activatedAt: null, currentPeriodEnd: null, startAt: START_DAY, ...overrides });

  /** What the page would show for the add-on, from its rows newest first. */
  function viewOf(rowsNewestFirst: readonly Row[], now: Date): AddOnView {
    const picked = pickAddOnRows(rowsNewestFirst);
    return addOnView(
      picked.current === null ? null : addOnFactsOf(picked.current),
      picked.successor === null ? null : addOnFactsOf(picked.successor),
      now,
    );
  }

  it("shows the add-on as renewing on the start day until that day comes", () => {
    expect(viewOf([kept(), ending()], BEFORE)).toEqual({ state: "active", renewsOn: START_DAY });
  });

  it("goes from kept, to the old row ending, to starting, to a failed first charge, to a halt, and then offers Pay now", () => {
    // Razorpay ends the old subscription at its cycle end, and the first charge of the kept one is due: starting, not failed.
    const oldEnded = nextAddOnStatus("active", "cancelled", DUE, null);
    expect(oldEnded).toEqual({ status: "cancelled", endedAt: DUE });
    const endedRow = ending({ status: "cancelled", endedAt: DUE });
    expect(viewOf([kept(), endedRow], DUE)).toEqual({ state: "starting", since: START_DAY });

    // The first charge fails: pending, then halted. The kept row is now the one shown.
    const pending = nextAddOnStatus("scheduled", "pending", DUE, START_DAY);
    expect(pending).toEqual({ status: "past_due" });
    expect(viewOf([kept({ status: "past_due" }), endedRow], DUE)).toEqual({ state: "failing" });

    const haltedAt = new Date("2026-11-04T00:00:00.000Z");
    const halted = nextAddOnStatus("past_due", "halted", haltedAt, START_DAY);
    expect(halted).toEqual({ status: "halted", haltedAt });
    const haltedRows = [kept({ status: "halted", haltedAt }), endedRow];
    const view = viewOf(haltedRows, new Date("2026-11-05T00:00:00.000Z"));
    expect(view).toEqual({ state: "failed", payBy: new Date("2026-11-11T00:00:00.000Z") });
    expect(addOnActions(view)).toEqual(["pay-now"]);
    expect(decideAddOnCheckout("pay-now", view)).toEqual({ kind: "allowed", startsOnPeriodEnd: false, continues: true });
    expect(pickAddOnRows(haltedRows).current?.id).toBe("k");
  });

  it("goes from a scheduled row straight to halted when Razorpay gives up without a pending event", () => {
    const haltedAt = new Date("2026-11-04T00:00:00.000Z");
    expect(nextAddOnStatus("scheduled", "halted", haltedAt, START_DAY)).toEqual({ status: "halted", haltedAt });
  });

  it("is ended once the 7 days to pay are up", () => {
    const haltedAt = new Date("2026-11-04T00:00:00.000Z");
    const rows = [kept({ status: "halted", haltedAt }), ending({ status: "cancelled", endedAt: DUE })];
    expect(viewOf(rows, new Date("2026-11-11T00:00:00.000Z"))).toEqual({ state: "ended" });
  });

  it("goes active when the first charge succeeds, renewing on the new period end", () => {
    const endedRow = ending({ status: "cancelled", endedAt: DUE });
    const charged = kept({ status: "active", activatedAt: DUE, currentPeriodEnd: NEXT_END, startAt: START_DAY });
    expect(viewOf([charged, endedRow], DUE)).toEqual({ state: "active", renewsOn: NEXT_END });
    expect(pickAddOnRows([charged, endedRow]).successor).toBeNull();
  });
});
