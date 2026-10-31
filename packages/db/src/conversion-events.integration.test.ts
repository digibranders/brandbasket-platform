import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimConversionEvent, listRetryableConversionPayments, markConversionEvent } from "./queries/conversion-events";
import { insertBusiness } from "./queries/onboarding";
import { conversionEvents, businessMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "ce-owner";

let dbs: TestDatabases;
let businessId = "";
let paymentId = "";
let otherPaymentId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function insertPayment(providerPaymentId: string): Promise<string> {
  const result = await dbs.owner.db.execute(
    sql.raw(`insert into payments (id, business_id, provider, provider_payment_id, kind, amount_cents, currency, status, paid_at) values (gen_random_uuid(), '${businessId}', 'razorpay', '${providerPaymentId}', 'initial', 299900, 'INR', 'captured', now()) returning id`),
  );
  return (result.rows as { id: string }[])[0]?.id ?? "";
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: OWNER, name: OWNER, email: `${OWNER}@example.com`, emailVerified: true });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
  paymentId = await insertPayment("pay_one");
  otherPaymentId = await insertPayment("pay_two");
});

const staff = () => dbs.staff.db;

/** Postgres reports a missing privilege as 42501 and a refused check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

describe("conversion_events", () => {
  it("lets one caller take a payment's destination at a time", async () => {
    expect(await claimConversionEvent(staff(), paymentId, "ga4")).toBe(true);
    expect(await claimConversionEvent(staff(), paymentId, "ga4")).toBe(false);
    expect(await claimConversionEvent(staff(), paymentId, "meta")).toBe(true);
  });

  it("never takes what was sent or skipped again, but takes a failed one back", async () => {
    await claimConversionEvent(staff(), paymentId, "ga4");
    await markConversionEvent(staff(), paymentId, "ga4", { status: "sent" });
    expect(await claimConversionEvent(staff(), paymentId, "ga4")).toBe(false);

    await claimConversionEvent(staff(), paymentId, "meta");
    await markConversionEvent(staff(), paymentId, "meta", { status: "skipped", reason: "no_consent" });
    expect(await claimConversionEvent(staff(), paymentId, "meta")).toBe(false);

    await claimConversionEvent(staff(), otherPaymentId, "ga4");
    await markConversionEvent(staff(), otherPaymentId, "ga4", { status: "failed", reason: "GA4 answered 500" });
    expect(await claimConversionEvent(staff(), otherPaymentId, "ga4")).toBe(true);
    const [row] = await staff().select().from(conversionEvents).where(sql`${conversionEvents.paymentId} = ${otherPaymentId}`);
    expect(row).toMatchObject({ status: "pending", attempts: 1, reason: "GA4 answered 500" });
  });

  it("takes back a claim whose sender never came back, once it is a quarter of an hour old", async () => {
    await claimConversionEvent(staff(), paymentId, "ga4");
    expect(await claimConversionEvent(staff(), paymentId, "ga4")).toBe(false);
    await dbs.owner.db.execute(sql.raw(`update conversion_events set updated_at = now() - interval '16 minutes'`));
    expect(await claimConversionEvent(staff(), paymentId, "ga4")).toBe(true);
  });

  it("lists the payments with a failed send worth trying again, once each", async () => {
    await claimConversionEvent(staff(), paymentId, "ga4");
    await markConversionEvent(staff(), paymentId, "ga4", { status: "failed", reason: "x" });
    await claimConversionEvent(staff(), paymentId, "meta");
    await markConversionEvent(staff(), paymentId, "meta", { status: "failed", reason: "x" });
    await claimConversionEvent(staff(), otherPaymentId, "ga4");
    await markConversionEvent(staff(), otherPaymentId, "ga4", { status: "sent" });
    expect(await listRetryableConversionPayments(staff(), new Date())).toEqual([paymentId]);
  });

  it("stops listing a send after five failures or a week", async () => {
    await claimConversionEvent(staff(), paymentId, "ga4");
    for (let i = 0; i < 5; i += 1) await markConversionEvent(staff(), paymentId, "ga4", { status: "failed", reason: "x" });
    expect(await listRetryableConversionPayments(staff(), new Date())).toEqual([]);
    await claimConversionEvent(staff(), otherPaymentId, "meta");
    await markConversionEvent(staff(), otherPaymentId, "meta", { status: "failed", reason: "x" });
    expect(await listRetryableConversionPayments(staff(), new Date(Date.now() + 8 * 24 * 60 * 60 * 1000))).toEqual([]);
  });

  it("is private to staff, and refuses a destination or status it does not know", async () => {
    const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
    expect(await sqlState(() => asOwner((tx) => tx.select().from(conversionEvents)))).toBe("42501");
    expect(await sqlState(() => staff().insert(conversionEvents).values({ paymentId, destination: "tiktok" as "ga4" }))).toBe("23514");
    expect(await sqlState(() => staff().insert(conversionEvents).values({ paymentId, destination: "ga4", status: "done" as "sent" }))).toBe("23514");
  });
});
