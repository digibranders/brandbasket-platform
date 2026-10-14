import type { BillingProvider } from "@firstfold/billing";
import {
  changeAddOnEndKind,
  consumeRateLimit,
  insertExitFeedback,
  listAddOnSubscriptionsForBusiness,
  lockBusinessForBilling,
  markAddOnCancelled,
  markCancelRequested,
  openAccountClosure,
  scheduleAddOnEnd,
  withTenantScope,
  type AddOnSubscription,
  type Database,
  type ScopedTransaction,
  type Subscription,
} from "@firstfold/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { closeAccountFor, hasRunningAddOnsFor } from "./account-exit";
import { checkPasswordFor } from "./account-security";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

// Database doubles: the rows' own rules (one end per row, the lock) are proven in packages/db, and the add-on planning
// in packages/shared. What is checked here is the order of closing an account: every provider call happens before the
// closure transaction opens, a failed call records nothing, and the add-ons are ended with the plan.
vi.mock("server-only", () => ({}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./account-security", () => ({ checkPasswordFor: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./discount-plans", () => ({ ensureDiscountPlan: vi.fn() }));
vi.mock("@firstfold/db", () => ({
  ACCOUNT_CLOSURE_GRACE_DAYS: 30,
  applyRetentionDiscount: vi.fn(),
  cancelStaleSubscription: vi.fn(),
  changeAddOnEndKind: vi.fn(),
  consumeRateLimit: vi.fn(),
  findAddOnSubscription: vi.fn(),
  insertExitFeedback: vi.fn(),
  listAddOnSubscriptionsForBusiness: vi.fn(),
  lockBusinessForBilling: vi.fn(),
  markAddOnCancelled: vi.fn(),
  markCancelRequested: vi.fn(),
  openAccountClosure: vi.fn(),
  restoreAccountClosure: vi.fn(),
  scheduleAddOnEnd: vi.fn(),
  withTenantScope: vi.fn(),
}));

const NOW = new Date("2026-10-20T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const USER_ID = "user-a";
const PLAN_SUBSCRIPTION_ID = `fake_sub_${"p".repeat(24)}`;
const DETAILS = { reason: "other", comment: "", password: "hunter2" } as const;

const customer = (subscription: Subscription | null): GrantedCustomer =>
  ({
    user: { id: USER_ID, email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null },
    tenant: { userId: USER_ID, businessId: BUSINESS_ID, businessName: "Riverside Dental", role: "owner" },
    billing: { status: "paid", hasAccess: true, subscription, tier: "care", upgradePaid: false, plan: null, paymentUnderReview: false, renewalFailingUntil: null },
  }) as GrantedCustomer;

/** A paid plan at the fake provider that has not been asked to end. */
const PLAN_SUBSCRIPTION = {
  id: "0192f3c4-3333-7000-8000-000000000001",
  status: "active",
  provider: "fake",
  providerSubscriptionId: PLAN_SUBSCRIPTION_ID,
  cancelRequestedAt: null,
  paidThroughAt: PERIOD_END,
} as Subscription;

let nextRow = 0;

function addOnRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  nextRow += 1;
  return {
    id: `0192f3c4-2222-7000-8000-${nextRow.toString(16).padStart(12, "0")}`,
    businessId: BUSINESS_ID,
    addOn: "local-seo",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${nextRow.toString(16).padStart(24, "0")}`,
    status: "active",
    endKind: null,
    currentPeriodEnd: PERIOD_END,
    startAt: null,
    continuesId: null,
    ...overrides,
  } as AddOnSubscription;
}

let events: string[];
let openTransactions: number;
let atPeriodEnd: MockInstance<BillingProvider["cancelSubscriptionAtPeriodEnd"]>;
let cancelNow: MockInstance<BillingProvider["cancelSubscription"]>;
let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  nextRow = 0;
  events = [];
  openTransactions = 0;
  atPeriodEnd = vi.fn(async (id: string) => {
    events.push(`${openTransactions === 0 ? "provider" : "provider INSIDE A TRANSACTION"}:end-at-period-end:${id.slice(-4)}`);
  });
  cancelNow = vi.fn(async (id: string) => {
    events.push(`${openTransactions === 0 ? "provider" : "provider INSIDE A TRANSACTION"}:cancel:${id.slice(-4)}`);
  });
  vi.mocked(getBillingProvider).mockReturnValue({ name: "fake", cancelSubscriptionAtPeriodEnd: atPeriodEnd, cancelSubscription: cancelNow } as unknown as BillingProvider);
  const tx = { name: "closure-tx" } as unknown as ScopedTransaction;
  vi.mocked(getStaffDb).mockReturnValue({
    transaction: async (work: (scoped: ScopedTransaction) => Promise<unknown>) => {
      openTransactions += 1;
      events.push("transaction:begin");
      try {
        const result = await work(tx);
        events.push("transaction:commit");
        return result;
      } catch (error) {
        events.push("transaction:rollback");
        throw error;
      } finally {
        openTransactions -= 1;
      }
    },
  } as unknown as Database);
  vi.mocked(getAppDb).mockReturnValue({} as Database);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof consumeRateLimit>>);
  vi.mocked(checkPasswordFor).mockResolvedValue("correct");
  vi.mocked(scheduleAddOnEnd).mockResolvedValue("scheduled");
  vi.mocked(changeAddOnEndKind).mockResolvedValue("changed");
  // After the ends are recorded, nothing is left to end.
  vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([]);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
});

/** The rows closure first sees, then (for the check under the lock) none that still need ending. */
function withRows(...rows: AddOnSubscription[]): void {
  vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValueOnce(rows).mockResolvedValue([]);
}

describe("closeAccountFor with add-ons", () => {
  it("closes an account with no add-ons exactly as before", async () => {
    withRows();

    const outcome = await closeAccountFor(customer(null), DETAILS, NOW);

    expect(outcome).toEqual({ kind: "closed" });
    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
    expect(openAccountClosure).toHaveBeenCalledTimes(1);
  });

  it("stops an active add-on at the end of the month it has paid for, then records a cancel by the customer", async () => {
    const row = addOnRow();
    withRows(row);

    const outcome = await closeAccountFor(customer(null), DETAILS, NOW);

    expect(outcome).toEqual({ kind: "closed" });
    expect(atPeriodEnd).toHaveBeenCalledWith(row.providerSubscriptionId);
    expect(cancelNow).not.toHaveBeenCalled();
    expect(scheduleAddOnEnd).toHaveBeenCalledWith(expect.anything(), { id: row.id, kind: "cancel", now: NOW, staffUserId: null });
    expect(events[0]).toBe(`provider:end-at-period-end:${row.providerSubscriptionId.slice(-4)}`);
    expect(events.indexOf("transaction:begin")).toBeGreaterThan(0);
    expect(events.some((event) => event.includes("INSIDE"))).toBe(false);
    expect(lockBusinessForBilling).toHaveBeenCalledWith(expect.anything(), BUSINESS_ID);
  });

  it("switches a scheduled pause to a cancel without a provider call", async () => {
    const row = addOnRow({ endKind: "pause" });
    withRows(row);

    await expect(closeAccountFor(customer(null), DETAILS, NOW)).resolves.toEqual({ kind: "closed" });

    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
    expect(changeAddOnEndKind).toHaveBeenCalledWith(expect.anything(), { id: row.id, kind: "cancel", now: NOW, staffUserId: null });
  });

  it("does nothing for an add-on already set to cancel, a paused one that has ended, or a cancelled one", async () => {
    withRows(addOnRow({ endKind: "cancel" }), addOnRow({ status: "cancelled" }));

    await expect(closeAccountFor(customer(null), DETAILS, NOW)).resolves.toEqual({ kind: "closed" });

    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(cancelNow).not.toHaveBeenCalled();
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
    expect(markAddOnCancelled).not.toHaveBeenCalled();
  });

  it("cancels at once a Keep it that has not started, an unpaid checkout, and past due and halted add-ons", async () => {
    const rows = [addOnRow({ status: "scheduled" }), addOnRow({ status: "incomplete" }), addOnRow({ status: "past_due" }), addOnRow({ status: "halted" })];
    withRows(...rows);

    await expect(closeAccountFor(customer(null), DETAILS, NOW)).resolves.toEqual({ kind: "closed" });

    expect(cancelNow.mock.calls.map(([id]) => id)).toEqual(rows.map((row) => row.providerSubscriptionId));
    expect(atPeriodEnd).not.toHaveBeenCalled();
    expect(vi.mocked(markAddOnCancelled).mock.calls.map(([, id]) => id)).toEqual(rows.map((row) => row.id));
  });

  it("refuses the closure and records nothing when the provider cannot stop an add-on", async () => {
    withRows(addOnRow({ status: "active" }), addOnRow({ status: "scheduled" }));
    cancelNow.mockRejectedValue(new Error("provider unreachable"));

    const outcome = await closeAccountFor(customer(null), DETAILS, NOW);

    expect(outcome).toMatchObject({ kind: "refused", field: null });
    expect(outcome.kind === "refused" ? outcome.message : "").toMatch(/^We couldn’t end your plan just now/);
    expect(events).not.toContain("transaction:begin");
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
    expect(markAddOnCancelled).not.toHaveBeenCalled();
    expect(markCancelRequested).not.toHaveBeenCalled();
    expect(openAccountClosure).not.toHaveBeenCalled();
    expect(insertExitFeedback).not.toHaveBeenCalled();
    // The error is named, never quoted.
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("provider unreachable");
  });

  it("refuses and records nothing when the plan ends but an add-on cannot, then finishes on a retry", async () => {
    const row = addOnRow({ status: "scheduled" });
    withRows(row);
    cancelNow.mockRejectedValueOnce(new Error("timeout"));
    const subscription = PLAN_SUBSCRIPTION;

    const first = await closeAccountFor(customer(subscription), DETAILS, NOW);

    expect(first.kind).toBe("refused");
    expect(atPeriodEnd).toHaveBeenCalledWith(PLAN_SUBSCRIPTION_ID);
    expect(markCancelRequested).not.toHaveBeenCalled();
    expect(openAccountClosure).not.toHaveBeenCalled();

    withRows(row);
    const second = await closeAccountFor(customer(subscription), DETAILS, NOW);

    expect(second).toEqual({ kind: "closed" });
    // The calls already made are made again, and the rest follow.
    expect(atPeriodEnd.mock.calls).toEqual([[PLAN_SUBSCRIPTION_ID], [PLAN_SUBSCRIPTION_ID]]);
    expect(cancelNow.mock.calls).toEqual([[row.providerSubscriptionId], [row.providerSubscriptionId]]);
    expect(markCancelRequested).toHaveBeenCalledTimes(1);
    expect(markAddOnCancelled).toHaveBeenCalledWith(expect.anything(), row.id, NOW);
  });

  it("rolls the closure back and refuses when an add-on still needs ending under the lock", async () => {
    // A payment landed after the rows were read: the check under the lock finds a row nobody told the provider about.
    vi.mocked(listAddOnSubscriptionsForBusiness)
      .mockResolvedValueOnce([addOnRow({ status: "active" })])
      .mockResolvedValueOnce([addOnRow({ status: "active" }), addOnRow({ status: "active" })]);

    const outcome = await closeAccountFor(customer(null), DETAILS, NOW);

    expect(outcome.kind).toBe("refused");
    expect(events.at(-1)).toBe("transaction:rollback");
    expect(openAccountClosure).not.toHaveBeenCalled();
  });

  it("records the add-on ends in the same transaction as the closure", async () => {
    withRows(addOnRow({ status: "active" }));

    await closeAccountFor(customer(null), DETAILS, NOW);

    expect(events.filter((event) => event.startsWith("transaction"))).toEqual(["transaction:begin", "transaction:commit"]);
    expect(openAccountClosure).toHaveBeenCalledTimes(1);
  });

  it("does not read or end anything when the password is wrong", async () => {
    vi.mocked(checkPasswordFor).mockResolvedValue("wrong-password");

    const outcome = await closeAccountFor(customer(null), DETAILS, NOW);

    expect(outcome).toMatchObject({ kind: "refused", field: "password" });
    expect(listAddOnSubscriptionsForBusiness).not.toHaveBeenCalled();
    expect(atPeriodEnd).not.toHaveBeenCalled();
  });
});

describe("hasRunningAddOnsFor", () => {
  const tenantTx = { name: "tenant-tx" } as unknown as ScopedTransaction;

  beforeEach(() => {
    vi.mocked(withTenantScope).mockImplementation((async (_db: unknown, _scope: unknown, work: (tx: ScopedTransaction) => Promise<unknown>) => work(tenantTx)) as unknown as typeof withTenantScope);
  });

  it("reads the business's rows through its own tenant scope", async () => {
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([addOnRow()]);

    await expect(hasRunningAddOnsFor(customer(null))).resolves.toBe(true);

    expect(withTenantScope).toHaveBeenCalledWith(expect.anything(), { userId: USER_ID, businessId: BUSINESS_ID }, expect.any(Function));
    expect(listAddOnSubscriptionsForBusiness).toHaveBeenCalledWith(tenantTx, BUSINESS_ID);
  });

  it("is false for a business whose add-ons are all over", async () => {
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue([addOnRow({ status: "cancelled" })]);

    await expect(hasRunningAddOnsFor(customer(null))).resolves.toBe(false);
  });
});
