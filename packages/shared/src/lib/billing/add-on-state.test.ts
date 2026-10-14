import { describe, expect, it } from "vitest";
import { addOnActions, addOnView, decideAddOnCheckout, nextAddOnStatus, type AddOnFacts } from "./add-on-state";

const NOW = new Date("2026-10-20T06:00:00Z");
const END = new Date("2026-11-12T06:00:00Z");
const facts = (overrides: Partial<AddOnFacts> = {}): AddOnFacts => ({
  status: "active", endKind: null, currentPeriodEnd: END, haltedAt: null, endedAt: null, startAt: null, ...overrides,
});

describe("addOnView", () => {
  it("shows nothing bought, an active subscription, and a scheduled end", () => {
    expect(addOnView(null, null, NOW)).toEqual({ state: "none" });
    expect(addOnView(facts(), null, NOW)).toEqual({ state: "active", renewsOn: END });
    expect(addOnView(facts({ endKind: "cancel" }), null, NOW)).toEqual({ state: "ending", endsOn: END });
    expect(addOnView(facts({ endKind: "pause" }), null, NOW)).toEqual({ state: "pausing", pausesOn: END });
  });

  it("is ended or paused once the paid period is over, even before Razorpay's cancelled event arrives", () => {
    const later = new Date("2026-11-13T00:00:00Z");
    expect(addOnView(facts({ endKind: "cancel" }), null, later)).toEqual({ state: "ended" });
    expect(addOnView(facts({ endKind: "pause" }), null, later)).toEqual({ state: "paused", since: END });
    expect(addOnView(facts({ status: "cancelled", endKind: "pause" }), null, later)).toEqual({ state: "paused", since: END });
    expect(addOnView(facts({ status: "cancelled", endKind: "cancel" }), null, later)).toEqual({ state: "ended" });
  });

  it("counts a kept subscription as active, renewing on the day the new one starts", () => {
    const kept = facts({ status: "scheduled", startAt: END, currentPeriodEnd: null });
    expect(addOnView(facts({ endKind: "cancel" }), kept, NOW)).toEqual({ state: "active", renewsOn: END });
  });

  it("shows a kept subscription whose start day has come, with no charge yet, as starting since that day", () => {
    const kept = facts({ status: "scheduled", startAt: END, currentPeriodEnd: null });
    const onStartDay = new Date(END.getTime());
    const later = new Date("2026-11-12T06:05:00Z");
    expect(addOnView(facts({ endKind: "cancel" }), kept, onStartDay)).toEqual({ state: "starting", since: END });
    expect(addOnView(facts({ status: "cancelled", endKind: "cancel" }), kept, later)).toEqual({ state: "starting", since: END });
    expect(addOnView(kept, null, later)).toEqual({ state: "starting", since: END });
    expect(addOnView(kept, kept, later)).toEqual({ state: "starting", since: END });
  });

  it("shows retries, then 7 days to pay, then ended", () => {
    expect(addOnView(facts({ status: "past_due" }), null, NOW)).toEqual({ state: "failing" });
    const halted = facts({ status: "halted", haltedAt: new Date("2026-10-15T06:00:00Z") });
    expect(addOnView(halted, null, NOW)).toEqual({ state: "failed", payBy: new Date("2026-10-22T06:00:00Z") });
    expect(addOnView(halted, null, new Date("2026-10-22T06:00:00Z"))).toEqual({ state: "ended" });
  });

  it("ignores a checkout that was never paid", () => {
    expect(addOnView(facts({ status: "incomplete", currentPeriodEnd: null }), null, NOW)).toEqual({ state: "none" });
  });
});

describe("addOnActions", () => {
  it("offers exactly the buttons the spec lists", () => {
    expect(addOnActions({ state: "none" })).toEqual(["buy"]);
    expect(addOnActions({ state: "ended" })).toEqual(["buy"]);
    expect(addOnActions({ state: "active", renewsOn: END })).toEqual(["pause", "cancel"]);
    expect(addOnActions({ state: "ending", endsOn: END })).toEqual(["keep"]);
    expect(addOnActions({ state: "pausing", pausesOn: END })).toEqual(["keep"]);
    expect(addOnActions({ state: "paused", since: END })).toEqual(["resume"]);
    expect(addOnActions({ state: "starting", since: END })).toEqual([]);
    expect(addOnActions({ state: "failing" })).toEqual([]);
    expect(addOnActions({ state: "failed", payBy: END })).toEqual(["pay-now"]);
  });
});

describe("nextAddOnStatus", () => {
  it("follows Razorpay's retries and halts, and treats cancelled as final", () => {
    expect(nextAddOnStatus("active", "pending", NOW, null)).toEqual({ status: "past_due" });
    expect(nextAddOnStatus("past_due", "halted", NOW, null)).toEqual({ status: "halted", haltedAt: NOW });
    expect(nextAddOnStatus("active", "cancelled", NOW, null)).toEqual({ status: "cancelled", endedAt: NOW });
    expect(nextAddOnStatus("active", "completed", NOW, null)).toEqual({ status: "cancelled", endedAt: NOW });
    expect(nextAddOnStatus("cancelled", "active", NOW, null)).toBeNull();
  });

  it("ignores a repeated or late event, so a repeat never stretches the grace or pulls a row backwards", () => {
    const later = new Date("2026-10-21T06:00:00Z");
    expect(nextAddOnStatus("halted", "halted", later, null)).toBeNull();
    expect(nextAddOnStatus("past_due", "pending", later, null)).toBeNull();
    expect(nextAddOnStatus("halted", "pending", later, null)).toBeNull();
    expect(nextAddOnStatus("incomplete", "pending", later, null)).toBeNull();
    expect(nextAddOnStatus("incomplete", "halted", later, null)).toBeNull();
    expect(nextAddOnStatus("past_due", "halted", later, null)).toEqual({ status: "halted", haltedAt: later });
    expect(nextAddOnStatus("active", "halted", later, null)).toEqual({ status: "halted", haltedAt: later });
  });

  it("follows a kept subscription whose first charge fails: retries move it to past_due, a halt starts the 7 days", () => {
    expect(nextAddOnStatus("scheduled", "pending", NOW, END)).toEqual({ status: "past_due" });
    expect(nextAddOnStatus("scheduled", "halted", NOW, END)).toEqual({ status: "halted", haltedAt: NOW });
  });

  it("marks a kept subscription scheduled once authorised, and leaves payment states to the charged event", () => {
    expect(nextAddOnStatus("incomplete", "authenticated", NOW, END)).toEqual({ status: "scheduled" });
    expect(nextAddOnStatus("incomplete", "authenticated", NOW, null)).toBeNull();
    expect(nextAddOnStatus("halted", "active", NOW, null)).toBeNull();
    expect(nextAddOnStatus("active", "created", NOW, null)).toBeNull();
  });
});

describe("decideAddOnCheckout", () => {
  it("buys only when nothing is running, and refuses what the state does not allow", () => {
    expect(decideAddOnCheckout("buy", { state: "none" })).toEqual({ kind: "allowed", startsOnPeriodEnd: false, continues: false });
    expect(decideAddOnCheckout("buy", { state: "active", renewsOn: END })).toEqual({ kind: "refused", reason: "already-active" });
    for (const view of [
      { state: "ending", endsOn: END },
      { state: "pausing", pausesOn: END },
      { state: "failing" },
    ] as const) {
      expect(decideAddOnCheckout("buy", view)).toEqual({ kind: "refused", reason: "already-active" });
    }
    expect(decideAddOnCheckout("buy", { state: "paused", since: END })).toEqual({ kind: "refused", reason: "not-allowed" });
    expect(decideAddOnCheckout("buy", { state: "failed", payBy: END })).toEqual({ kind: "refused", reason: "not-allowed" });
    expect(decideAddOnCheckout("resume", { state: "paused", since: END })).toEqual({ kind: "allowed", startsOnPeriodEnd: false, continues: true });
    expect(decideAddOnCheckout("pay-now", { state: "failed", payBy: END })).toEqual({ kind: "allowed", startsOnPeriodEnd: false, continues: true });
    expect(decideAddOnCheckout("keep", { state: "ending", endsOn: END })).toEqual({ kind: "allowed", startsOnPeriodEnd: true, continues: true });
    expect(decideAddOnCheckout("keep", { state: "active", renewsOn: END })).toEqual({ kind: "refused", reason: "not-allowed" });
  });

  it("refuses every intent on a kept subscription that is starting, since it is billing", () => {
    for (const intent of ["buy", "resume", "pay-now", "keep"] as const) {
      expect(decideAddOnCheckout(intent, { state: "starting", since: END })).toEqual({ kind: "refused", reason: "already-active" });
    }
  });
});
