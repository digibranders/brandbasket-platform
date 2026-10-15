import { randomUUID } from "node:crypto";
import { createFakeBillingProvider, chargedAmountCents, type BillingProvider } from "@fynix/billing";
import {
  billingProfiles,
  businesses,
  findAddOnSubscription,
  insertAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  updateAddOnStatus,
  users,
  type AddOnSubscription,
} from "@fynix/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@fynix/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addOnView } from "./lib/billing/add-on-state";
import { addOnFactsOf, pickAddOnRows } from "./lib/billing/add-on-rows";
import { activateAddOnPayment } from "./server/add-on-activation";
import { addOnEndMessage, scheduleAddOnEndFor } from "./server/add-on-ends";

// The server-only guard has no browser to keep these modules out of here.
vi.mock("server-only", () => ({}));

/** Pausing, cancelling and undoing a Keep it, against a real database and the fake provider. */

const PAID_AT = new Date("2026-10-12T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");
const NOW = new Date("2026-10-20T09:00:00.000Z");
const LIST_CENTS = 1_000_000;
const TAX_BASIS_POINTS = 1_800;

let dbs: TestDatabases;
let businessId = "";
let provider: BillingProvider;

async function seedBusiness(): Promise<string> {
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "qa-add-on-ends", name: "QA Add-on Ends Business", currency: "INR" })
    .returning({ id: businesses.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("The business was not inserted");
  await dbs.owner.db.insert(billingProfiles).values({
    businessId: id,
    legalName: "QA Add-on Ends LLP",
    gstin: "27AAPFU0939F1ZV",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  });
  return id;
}

function addRow(overrides: Partial<Parameters<typeof insertAddOnSubscription>[1]> = {}): Promise<AddOnSubscription> {
  return insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "social-media",
    listAmountCents: LIST_CENTS,
    discountAmountCents: 0,
    netAmountCents: LIST_CENTS,
    taxRateBasisPoints: TAX_BASIS_POINTS,
    chargedAmountCents: chargedAmountCents(LIST_CENTS, 0, TAX_BASIS_POINTS),
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    ...overrides,
  });
}

async function activeRow(): Promise<AddOnSubscription> {
  const row = await addRow();
  await dbs.staff.db.transaction((tx) =>
    activateAddOnPayment(tx, {
      addOnSubscriptionId: row.id,
      provider: "fake",
      providerPaymentId: `fake_pay_${randomUUID()}`,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      paidAt: PAID_AT,
      periodStart: PAID_AT,
      periodEnd: PERIOD_END,
    }),
  );
  return row;
}

async function viewNow() {
  const rows = (await listAddOnSubscriptionsForBusiness(dbs.staff.db, businessId)).filter((row) => row.addOn === "social-media");
  const { current, successor } = pickAddOnRows(rows);
  return addOnView(current === null ? null : addOnFactsOf(current), successor === null ? null : addOnFactsOf(successor), NOW);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  businessId = await seedBusiness();
  provider = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => NOW });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduleAddOnEndFor", () => {
  it("cancels at the end of the paid month: the row keeps running until then and records when the end was asked for", async () => {
    const row = await activeRow();

    const outcome = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: row.id, kind: "cancel", staffUserId: null }, NOW);

    expect(addOnEndMessage(outcome)).toBe("Social media will stop on 12 November 2026. You won't be charged again.");
    expect(await findAddOnSubscription(dbs.staff.db, businessId, row.id)).toMatchObject({
      status: "active",
      endKind: "cancel",
      endRequestedAt: NOW,
      currentPeriodEnd: PERIOD_END,
    });
    expect(await viewNow()).toEqual({ state: "ending", endsOn: PERIOD_END });
  });

  it("pauses the same way, and a second request is refused with the first one standing", async () => {
    const row = await activeRow();
    await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: row.id, kind: "pause", staffUserId: null }, NOW);

    const again = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: row.id, kind: "cancel", staffUserId: null }, NOW);

    expect(again).toMatchObject({ kind: "refused", reason: "already-ending", endKind: "pause" });
    expect(await viewNow()).toEqual({ state: "pausing", pausesOn: PERIOD_END });
  });

  it("refuses a row of another business", async () => {
    const row = await activeRow();
    const others = await dbs.owner.db
      .insert(businesses)
      .values({ slug: "qa-add-on-ends-other", name: "Another Business", currency: "INR" })
      .returning({ id: businesses.id });
    const other = others[0]?.id ?? "";

    const outcome = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId: other, addOnSubscriptionId: row.id, kind: "cancel", staffUserId: null }, NOW);

    expect(outcome).toMatchObject({ kind: "refused", reason: "not-found" });
  });

  it("undoes a Keep it that has not started: it is cancelled and the add-on is back to Ending", async () => {
    const ending = await activeRow();
    await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: ending.id, kind: "cancel", staffUserId: null }, NOW);
    const kept = await addRow({ continuesId: ending.id, startAt: PERIOD_END });
    await updateAddOnStatus(dbs.staff.db, { id: kept.id, status: "scheduled", providerStatus: "authenticated", now: NOW, expectedFrom: "incomplete" });
    expect(await viewNow()).toEqual({ state: "active", renewsOn: PERIOD_END });

    const outcome = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: kept.id, kind: "cancel", staffUserId: null }, NOW);

    expect(outcome).toMatchObject({ kind: "keep-undone", endKind: "cancel", endsOn: PERIOD_END });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, kept.id)).toMatchObject({ status: "cancelled" });
    expect(await viewNow()).toEqual({ state: "ending", endsOn: PERIOD_END });
  });

  it("makes Pause on a kept subscription pause the old row, which Razorpay ends at cycle end either way", async () => {
    const ending = await activeRow();
    await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: ending.id, kind: "cancel", staffUserId: null }, NOW);
    const kept = await addRow({ continuesId: ending.id, startAt: PERIOD_END });
    await updateAddOnStatus(dbs.staff.db, { id: kept.id, status: "scheduled", providerStatus: "authenticated", now: NOW, expectedFrom: "incomplete" });

    const outcome = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: kept.id, kind: "pause", staffUserId: null }, NOW);

    expect(addOnEndMessage(outcome)).toBe("Social media will pause on 12 November 2026.");
    expect(await findAddOnSubscription(dbs.staff.db, businessId, kept.id)).toMatchObject({ status: "cancelled" });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, ending.id)).toMatchObject({ status: "active", endKind: "pause", currentPeriodEnd: PERIOD_END });
    expect(await viewNow()).toEqual({ state: "pausing", pausesOn: PERIOD_END });
  });

  it("makes Cancel on a kept subscription cancel the old row that was set to pause, and records the staff member who asked", async () => {
    const ending = await activeRow();
    await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: ending.id, kind: "pause", staffUserId: null }, NOW);
    const kept = await addRow({ continuesId: ending.id, startAt: PERIOD_END });
    await updateAddOnStatus(dbs.staff.db, { id: kept.id, status: "scheduled", providerStatus: "authenticated", now: NOW, expectedFrom: "incomplete" });
    await dbs.owner.db.insert(users).values({ id: "staff-ends", name: "Staff", email: "staff-ends@example.test", emailVerified: true });

    const outcome = await scheduleAddOnEndFor(dbs.staff.db, provider, { businessId, addOnSubscriptionId: kept.id, kind: "cancel", staffUserId: "staff-ends" }, NOW);

    expect(addOnEndMessage(outcome)).toBe("Social media will stop on 12 November 2026. You won't be charged again.");
    expect(await findAddOnSubscription(dbs.staff.db, businessId, ending.id)).toMatchObject({ endKind: "cancel", endRequestedByStaffId: "staff-ends" });
    expect(await viewNow()).toEqual({ state: "ending", endsOn: PERIOD_END });
  });
});
