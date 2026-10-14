import type { BillingProvider } from "@fynix/billing";
import {
  changeAddOnEndKind,
  findAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  lockBusinessForBilling,
  markAddOnCancelled,
  scheduleAddOnEnd,
  type AddOnSubscription,
  type Database,
  type ScopedTransaction,
} from "@fynix/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  AddOnClosureChangedError,
  addOnEndMessage,
  planAddOnClosure,
  recordAddOnClosure,
  scheduleAddOnEndFor,
  stopAddOnsAtProvider,
  type AddOnEndOutcome,
} from "./add-on-ends";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({
  changeAddOnEndKind: vi.fn(),
  findAddOnSubscription: vi.fn(),
  listAddOnSubscriptionsForBusiness: vi.fn(),
  lockBusinessForBilling: vi.fn(),
  markAddOnCancelled: vi.fn(),
  scheduleAddOnEnd: vi.fn(),
}));

// Database doubles: the row-level rules (one end per row, the lock) are proven in packages/db. What is checked here is
// the order of the steps, that the provider is only ever called with no transaction open, and what each outcome says.
const NOW = new Date("2026-10-20T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const ROW_ID = "0192f3c4-2222-7000-8000-000000000001";
const OLD_ID = "0192f3c4-2222-7000-8000-000000000000";
const REQUEST = { businessId: BUSINESS_ID, addOnSubscriptionId: ROW_ID, kind: "cancel", staffUserId: null } as const;

let events: string[];
let openTransactions: number;
let atPeriodEnd: MockInstance<BillingProvider["cancelSubscriptionAtPeriodEnd"]>;
let cancelNow: MockInstance<BillingProvider["cancelSubscription"]>;
let provider: BillingProvider;
let staffDb: Database;
let logged: MockInstance<typeof console.error>;
let warned: MockInstance<typeof console.warn>;

function addOnRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  return {
    id: ROW_ID,
    businessId: BUSINESS_ID,
    addOn: "local-seo",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    status: "active",
    endKind: null,
    currentPeriodEnd: PERIOD_END,
    startAt: null,
    continuesId: null,
    ...overrides,
  } as AddOnSubscription;
}

beforeEach(() => {
  vi.resetAllMocks();
  events = [];
  openTransactions = 0;
  atPeriodEnd = vi.fn(async () => {
    events.push(openTransactions === 0 ? "provider:end-at-period-end" : "provider:end-at-period-end INSIDE A TRANSACTION");
  });
  cancelNow = vi.fn(async () => {
    events.push(openTransactions === 0 ? "provider:cancel" : "provider:cancel INSIDE A TRANSACTION");
  });
  provider = { name: "fake", cancelSubscriptionAtPeriodEnd: atPeriodEnd, cancelSubscription: cancelNow } as unknown as BillingProvider;
  let count = 0;
  staffDb = {
    transaction: async (work: (tx: ScopedTransaction) => Promise<unknown>) => {
      count += 1;
      const name = `tx${count}`;
      openTransactions += 1;
      events.push(`${name}:begin`);
      try {
        const result = await work({ name } as unknown as ScopedTransaction);
        events.push(`${name}:commit`);
        return result;
      } catch (error) {
        events.push(`${name}:rollback`);
        throw error;
      } finally {
        openTransactions -= 1;
      }
    },
  } as unknown as Database;
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(findAddOnSubscription).mockResolvedValue(addOnRow());
  vi.mocked(scheduleAddOnEnd).mockResolvedValue("scheduled");
});

afterEach(() => {
  logged.mockRestore();
  warned.mockRestore();
});

describe("scheduleAddOnEndFor", () => {
  it("tells the provider to stop at the end of the month with no transaction open, then records the end under the lock", async () => {
    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toEqual({ kind: "scheduled", addOn: "local-seo", endKind: "cancel", endsOn: PERIOD_END });
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:end-at-period-end", "tx2:begin", "tx2:commit"]);
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(1, { name: "tx1" }, BUSINESS_ID);
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(2, { name: "tx2" }, BUSINESS_ID);
    expect(atPeriodEnd).toHaveBeenCalledWith(`fake_sub_${"a".repeat(24)}`);
    expect(scheduleAddOnEnd).toHaveBeenCalledWith({ name: "tx2" }, { id: ROW_ID, kind: "cancel", now: NOW, staffUserId: null });
    expect(cancelNow).not.toHaveBeenCalled();
  });

  it("records a pause the same way, and who asked when staff did", async () => {
    const outcome = await scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "pause", staffUserId: "staff-1" }, NOW);

    expect(outcome).toMatchObject({ kind: "scheduled", endKind: "pause", endsOn: PERIOD_END });
    expect(scheduleAddOnEnd).toHaveBeenCalledWith({ name: "tx2" }, { id: ROW_ID, kind: "pause", now: NOW, staffUserId: "staff-1" });
  });

  it("reports the period end as it stands after the end was recorded, since a renewal can land in between", async () => {
    const renewed = new Date("2026-12-12T09:00:00.000Z");
    vi.mocked(findAddOnSubscription)
      .mockResolvedValueOnce(addOnRow())
      .mockResolvedValueOnce(addOnRow({ currentPeriodEnd: renewed }));

    await expect(scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW)).resolves.toMatchObject({ kind: "scheduled", endsOn: renewed });
  });

  it("records nothing and asks to try again when the provider cannot be reached", async () => {
    atPeriodEnd.mockRejectedValue(new Error("provider unreachable"));

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "provider-unavailable" });
    expect(addOnEndMessage(outcome)).toBe("We couldn't reach the payment provider. Try again in a minute.");
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
    // The error is named, never quoted.
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-end-failed /);
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("provider unreachable");
  });

  it("refuses a row of another business, or one that does not exist, without calling the provider", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(null);

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "not-found", addOn: null });
    expect(addOnEndMessage(outcome)).toBe("We couldn't find that add-on.");
    expect(findAddOnSubscription).toHaveBeenCalledWith({ name: "tx1" }, BUSINESS_ID, ROW_ID);
    expect(atPeriodEnd).not.toHaveBeenCalled();
  });

  it.each(["incomplete", "past_due", "halted", "cancelled"] as const)("refuses a %s row, which is not running", async (status) => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(addOnRow({ status }));

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "not-running", addOn: "local-seo" });
    expect(addOnEndMessage(outcome)).toBe("Local SEO isn't running, so it can't be paused or cancelled.");
    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
  });

  it("refuses a row that is already ending, and says when, without calling the provider again", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(addOnRow({ endKind: "pause" }));

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "already-ending", endKind: "pause", endsOn: PERIOD_END });
    expect(addOnEndMessage(outcome)).toBe("Local SEO is already set to pause on 12 November 2026.");
    expect(atPeriodEnd).not.toHaveBeenCalled();
  });

  it("refuses a row opened at a provider other than the configured one, since that provider cannot stop it", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(addOnRow({ provider: "razorpay" }));

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "provider-unavailable" });
    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toContain("add-on-end-failed");
  });

  it("logs for staff when the provider was told to stop but the row had moved on by the time it was recorded", async () => {
    vi.mocked(scheduleAddOnEnd).mockResolvedValue("not-active");

    const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "changed-meanwhile" });
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-end-not-recorded /);
  });

  it("reports an end set by someone else in the meantime as already ending", async () => {
    vi.mocked(scheduleAddOnEnd).mockResolvedValue("already");
    vi.mocked(findAddOnSubscription).mockResolvedValueOnce(addOnRow()).mockResolvedValueOnce(addOnRow({ endKind: "cancel" }));

    await expect(scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "pause" }, NOW)).resolves.toMatchObject({
      kind: "refused",
      reason: "already-ending",
      endKind: "cancel",
      endsOn: PERIOD_END,
    });
  });

  describe("a kept subscription that has not started", () => {
    const kept = addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, continuesId: OLD_ID });
    const ending = addOnRow({ id: OLD_ID, endKind: "cancel", providerSubscriptionId: `fake_sub_${"b".repeat(24)}` });

    beforeEach(() => {
      vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => (id === ROW_ID ? kept : id === OLD_ID ? ending : null));
    });

    it("cancels it at the provider at once and marks it cancelled, which brings back the Ending state of the row it continues", async () => {
      const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

      expect(outcome).toEqual({ kind: "keep-undone", addOn: "local-seo", endKind: "cancel", endsOn: PERIOD_END });
      expect(addOnEndMessage(outcome)).toBe("Local SEO will stop on 12 November 2026. You won't be charged again.");
      expect(cancelNow).toHaveBeenCalledWith(kept.providerSubscriptionId);
      expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:cancel", "tx2:begin", "tx2:commit"]);
      expect(markAddOnCancelled).toHaveBeenCalledWith({ name: "tx2" }, ROW_ID, NOW);
      expect(scheduleAddOnEnd).not.toHaveBeenCalled();
      expect(atPeriodEnd).not.toHaveBeenCalled();
    });

    it("keeps the old row's end as it is, and writes nothing to it, when the kind asked for is the one it already has", async () => {
      await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

      expect(changeAddOnEndKind).not.toHaveBeenCalled();
    });

    it("makes Cancel on a kept subscription cancel, even though the old row was set to pause", async () => {
      vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => (id === ROW_ID ? kept : { ...ending, endKind: "pause" }));
      vi.mocked(changeAddOnEndKind).mockResolvedValue("changed");

      const outcome = await scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "cancel", staffUserId: "staff-1" }, NOW);

      expect(outcome).toEqual({ kind: "keep-undone", addOn: "local-seo", endKind: "cancel", endsOn: PERIOD_END });
      expect(addOnEndMessage(outcome)).toBe("Local SEO will stop on 12 November 2026. You won't be charged again.");
      expect(changeAddOnEndKind).toHaveBeenCalledWith({ name: "tx2" }, { id: OLD_ID, kind: "cancel", now: NOW, staffUserId: "staff-1" });
      expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:cancel", "tx2:begin", "tx2:commit"]);
    });

    it("makes Pause on a kept subscription pause, even though the old row was set to cancel", async () => {
      vi.mocked(changeAddOnEndKind).mockResolvedValue("changed");

      const outcome = await scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "pause" }, NOW);

      expect(outcome).toEqual({ kind: "keep-undone", addOn: "local-seo", endKind: "pause", endsOn: PERIOD_END });
      expect(addOnEndMessage(outcome)).toBe("Local SEO will pause on 12 November 2026.");
      expect(changeAddOnEndKind).toHaveBeenCalledWith({ name: "tx2" }, { id: OLD_ID, kind: "pause", now: NOW, staffUserId: null });
      expect(markAddOnCancelled).toHaveBeenCalledWith({ name: "tx2" }, ROW_ID, NOW);
    });

    it("says what the old row will really do when it can no longer be changed, rather than what was asked", async () => {
      vi.mocked(changeAddOnEndKind).mockResolvedValue("not-ending");

      const outcome = await scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "pause" }, NOW);

      expect(outcome).toMatchObject({ kind: "keep-undone", endKind: "cancel" });
    });

    it("changes no old row when the kept subscription does not name one", async () => {
      vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => (id === ROW_ID ? { ...kept, continuesId: null } : null));

      const outcome = await scheduleAddOnEndFor(staffDb, provider, { ...REQUEST, kind: "pause" }, NOW);

      expect(outcome).toMatchObject({ kind: "keep-undone", endKind: "pause", endsOn: PERIOD_END });
      expect(changeAddOnEndKind).not.toHaveBeenCalled();
    });

    it("marks nothing cancelled when the provider cannot be reached", async () => {
      cancelNow.mockRejectedValue(new Error("provider unreachable"));

      const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

      expect(outcome).toMatchObject({ kind: "refused", reason: "provider-unavailable" });
      expect(markAddOnCancelled).not.toHaveBeenCalled();
    });

    it("logs for staff when the kept subscription started while it was being cancelled", async () => {
      let reads = 0;
      vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => {
        if (id === OLD_ID) return ending;
        reads += 1;
        return reads === 1 ? kept : { ...kept, status: "active" };
      });

      const outcome = await scheduleAddOnEndFor(staffDb, provider, REQUEST, NOW);

      expect(outcome).toMatchObject({ kind: "refused", reason: "changed-meanwhile" });
      expect(markAddOnCancelled).not.toHaveBeenCalled();
      expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-end-not-recorded /);
    });
  });
});

describe("addOnEndMessage", () => {
  const scheduled = (endKind: "cancel" | "pause"): AddOnEndOutcome => ({ kind: "scheduled", addOn: "performance-marketing", endKind, endsOn: PERIOD_END });

  it("says the add-on will stop, and that no more is charged, for a cancel", () => {
    expect(addOnEndMessage(scheduled("cancel"))).toBe("Performance marketing will stop on 12 November 2026. You won't be charged again.");
  });

  it("says the add-on will pause for a pause", () => {
    expect(addOnEndMessage(scheduled("pause"))).toBe("Performance marketing will pause on 12 November 2026.");
  });

  it("names the day in India time: late on the 12th in UTC is already the 13th in Mumbai", () => {
    const late = new Date("2026-11-12T20:00:00.000Z");
    expect(addOnEndMessage({ ...scheduled("cancel"), endsOn: late })).toContain("13 November 2026");
  });

  it("says the change that was in progress could not be finished, for a row that moved on", () => {
    expect(addOnEndMessage({ kind: "refused", reason: "changed-meanwhile", addOn: "local-seo", endKind: null, endsOn: null })).toBe(
      "Something changed while we were updating Local SEO. Please check the page and try again.",
    );
  });
});

const SUB_ONE = `fake_sub_${"1".repeat(24)}`;
const SUB_TWO = `fake_sub_${"2".repeat(24)}`;
const SUB_THREE = `fake_sub_${"3".repeat(24)}`;

function rowWith(id: string, overrides: Partial<AddOnSubscription>): AddOnSubscription {
  return addOnRow({ id, providerSubscriptionId: `fake_sub_${id.slice(-1).repeat(24)}`, ...overrides });
}

describe("planAddOnClosure", () => {
  const actionOf = (overrides: Partial<AddOnSubscription>): string | undefined => planAddOnClosure([rowWith("r1", overrides)])[0]?.action;

  it("stops an active add-on with no end at the end of the month it has paid for", () => {
    expect(actionOf({ status: "active", endKind: null })).toBe("end-at-period-end");
  });

  it("turns a scheduled pause into a cancel without another provider call", () => {
    expect(actionOf({ status: "active", endKind: "pause" })).toBe("switch-to-cancel");
  });

  it("leaves an active add-on that is already set to cancel alone", () => {
    expect(planAddOnClosure([rowWith("r1", { status: "active", endKind: "cancel" })])).toEqual([]);
  });

  it("cancels at once everything that has not been paid for yet or whose period is unpaid", () => {
    for (const status of ["scheduled", "incomplete", "past_due", "halted"] as const) {
      expect(actionOf({ status, endKind: null }), status).toBe("cancel-now");
    }
    // An end that was scheduled on an unpaid row does not make it paid.
    expect(actionOf({ status: "past_due", endKind: "cancel" })).toBe("cancel-now");
  });

  it("leaves a cancelled row alone", () => {
    expect(planAddOnClosure([rowWith("r1", { status: "cancelled" })])).toEqual([]);
  });

  it("plans every row of the business, in the order given", () => {
    const rows = [rowWith("r1", { status: "scheduled" }), rowWith("r2", { status: "active", endKind: "pause" }), rowWith("r3", { status: "cancelled" })];
    expect(planAddOnClosure(rows).map((step) => [step.row.id, step.action])).toEqual([
      ["r1", "cancel-now"],
      ["r2", "switch-to-cancel"],
    ]);
  });
});

describe("stopAddOnsAtProvider", () => {
  it("calls the provider for each add-on that needs it and none for a pause that only changes our record", async () => {
    const steps = planAddOnClosure([
      rowWith("r1", { status: "active", endKind: null, providerSubscriptionId: SUB_ONE }),
      rowWith("r2", { status: "incomplete", providerSubscriptionId: SUB_TWO }),
      rowWith("r3", { status: "active", endKind: "pause", providerSubscriptionId: SUB_THREE }),
    ]);

    await expect(stopAddOnsAtProvider(provider, steps)).resolves.toBe(true);

    expect(atPeriodEnd).toHaveBeenCalledTimes(1);
    expect(atPeriodEnd).toHaveBeenCalledWith(SUB_ONE);
    expect(cancelNow).toHaveBeenCalledTimes(1);
    expect(cancelNow).toHaveBeenCalledWith(SUB_TWO);
    expect(events).toEqual(["provider:end-at-period-end", "provider:cancel"]);
  });

  it("stops at the first failure, reports it, and names the error without quoting it", async () => {
    cancelNow.mockRejectedValue(new Error("provider unreachable"));
    const steps = planAddOnClosure([
      rowWith("r1", { status: "scheduled", providerSubscriptionId: SUB_ONE }),
      rowWith("r2", { status: "active", endKind: null, providerSubscriptionId: SUB_TWO }),
    ]);

    await expect(stopAddOnsAtProvider(provider, steps)).resolves.toBe(false);

    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-end-failed /);
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("provider unreachable");
  });

  it("makes no call at all when one add-on belongs to another provider than the one configured", async () => {
    const steps = planAddOnClosure([
      rowWith("r1", { status: "active", endKind: null, providerSubscriptionId: SUB_ONE }),
      rowWith("r2", { status: "incomplete", provider: "razorpay", providerSubscriptionId: "sub_Razorpay0001" }),
    ]);

    await expect(stopAddOnsAtProvider(provider, steps)).resolves.toBe(false);

    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toContain("ProviderNotConfigured");
  });

  it("makes the same calls again when run again after a failure, so a retry finishes what the first attempt began", async () => {
    const steps = planAddOnClosure([
      rowWith("r1", { status: "active", endKind: null, providerSubscriptionId: SUB_ONE }),
      rowWith("r2", { status: "scheduled", providerSubscriptionId: SUB_TWO }),
    ]);
    cancelNow.mockRejectedValueOnce(new Error("timeout"));

    await expect(stopAddOnsAtProvider(provider, steps)).resolves.toBe(false);
    await expect(stopAddOnsAtProvider(provider, steps)).resolves.toBe(true);

    expect(atPeriodEnd.mock.calls).toEqual([[SUB_ONE], [SUB_ONE]]);
    expect(cancelNow.mock.calls).toEqual([[SUB_TWO], [SUB_TWO]]);
  });
});

describe("recordAddOnClosure", () => {
  const tx = { name: "closure-tx" } as unknown as ScopedTransaction;

  it("records each end under the business lock and asks nothing of the provider", async () => {
    const rows = [
      rowWith("r1", { status: "active", endKind: null }),
      rowWith("r2", { status: "active", endKind: "pause" }),
      rowWith("r3", { status: "scheduled" }),
    ];
    vi.mocked(changeAddOnEndKind).mockResolvedValue("changed");
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([]);

    await recordAddOnClosure(tx, BUSINESS_ID, planAddOnClosure(rows), NOW);

    expect(lockBusinessForBilling).toHaveBeenCalledWith(tx, BUSINESS_ID);
    // The customer closed the account, so no staff member is named.
    expect(scheduleAddOnEnd).toHaveBeenCalledWith(tx, { id: "r1", kind: "cancel", now: NOW, staffUserId: null });
    expect(changeAddOnEndKind).toHaveBeenCalledWith(tx, { id: "r2", kind: "cancel", now: NOW, staffUserId: null });
    expect(markAddOnCancelled).toHaveBeenCalledWith(tx, "r3", NOW);
    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
  });

  it("throws, so the closure rolls back, when a row still needs ending afterwards (a payment landed meanwhile)", async () => {
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([rowWith("r9", { status: "active", endKind: null })]);

    await expect(recordAddOnClosure(tx, BUSINESS_ID, [], NOW)).rejects.toBeInstanceOf(AddOnClosureChangedError);
  });

  it("does nothing, and does not throw, for a business with no add-ons", async () => {
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([]);

    await expect(recordAddOnClosure(tx, BUSINESS_ID, [], NOW)).resolves.toBeUndefined();
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
    expect(markAddOnCancelled).not.toHaveBeenCalled();
  });
});
