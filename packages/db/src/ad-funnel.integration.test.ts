import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listAdFunnelData } from "./queries/ad-funnel";
import { insertBusiness } from "./queries/onboarding";
import { recordSignupAttribution } from "./queries/signup-attribution";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;
let first = "";
let second = "";
let third = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

const exec = (text: string) => dbs.owner.db.execute(sql.raw(text));

async function payment(businessId: string, providerPaymentId: string, over: { kind?: string; status?: string; amount?: number; paidAt?: string; attention?: string } = {}): Promise<string> {
  const { kind = "initial", status = "captured", amount = 299900, paidAt = "2026-11-02T10:00:00Z", attention } = over;
  const result = await exec(
    `insert into payments (id, business_id, provider, provider_payment_id, kind, amount_cents, currency, status, paid_at${attention ? ", attention_reason, attention_raised_at" : ""}) values (gen_random_uuid(), '${businessId}', 'razorpay', '${providerPaymentId}', '${kind}', ${amount}, 'INR', '${status}', '${paidAt}'${attention ? `, '${attention}', now()` : ""}) returning id`,
  );
  return (result.rows as { id: string }[])[0]?.id ?? "";
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  const make = async (name: string) => (await dbs.staff.db.transaction((tx) => insertBusiness(tx, name, "INR"))).id;
  [first, second, third] = [await make("One"), await make("Two"), await make("Three")];
  const ad = { utmSource: "meta", utmMedium: "paid_social", utmCampaign: "diwali", consentMeasurement: false, consentAdvertising: false };
  await recordSignupAttribution(dbs.staff.db, first, ad);
  await recordSignupAttribution(dbs.staff.db, second, ad);
  await recordSignupAttribution(dbs.staff.db, third, { ...ad, utmCampaign: "old" });
  await exec(`update signup_attribution set captured_at = '2026-11-02T00:00:00Z' where business_id in ('${first}', '${second}')`);
  await exec(`update signup_attribution set captured_at = '2026-10-01T00:00:00Z' where business_id = '${third}'`);
});

const RANGE: [Date, Date] = [new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z")];

describe("listAdFunnelData", () => {
  it("lists the accounts opened in the window, each business's first applied plan payment, and its GST", async () => {
    await payment(first, "pay_later", { paidAt: "2026-11-09T10:00:00Z", amount: 100 });
    await payment(first, "pay_first", { paidAt: "2026-11-02T10:00:00Z" });
    await payment(second, "pay_charge", { kind: "charge" });
    await payment(second, "pay_unapplied", { attention: "amount_mismatch" });
    const data = await listAdFunnelData(dbs.staff.db, ...RANGE);
    expect(data.accounts.map((account) => account.businessId).sort()).toEqual([first, second].sort());
    expect(data.firstPayments).toEqual([{ businessId: first, currency: "INR", amountCents: 299900, gstCents: null }]);
  });

  it("lists the leads the ad page sent in the window, and no others", async () => {
    await exec(`insert into leads (id, name, business_name, email, message, created_at) values
      (gen_random_uuid(), 'A', 'x', 'a@example.com', 'Ad landing page. Going to payment. utm_source=meta', '2026-11-03T00:00:00Z'),
      (gen_random_uuid(), 'B', 'x', 'b@example.com', 'Hello, a website please', '2026-11-03T00:00:00Z'),
      (gen_random_uuid(), 'C', 'x', 'c@example.com', 'Ad landing page. Going to payment.', '2026-10-03T00:00:00Z')`);
    const data = await listAdFunnelData(dbs.staff.db, ...RANGE);
    expect(data.leads).toEqual([{ message: "Ad landing page. Going to payment. utm_source=meta" }]);
  });

  it("is empty, and runs no payment query, when nobody came from an ad", async () => {
    await exec("delete from signup_attribution");
    expect(await listAdFunnelData(dbs.staff.db, ...RANGE)).toEqual({ leads: [], accounts: [], firstPayments: [] });
  });
});
