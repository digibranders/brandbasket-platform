import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, planTierForSignupChoice } from "./billing";
import { captureErrorText, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "../testing";

let databases: TestDatabases;

beforeAll(() => {
  databases = openTestDatabases();
});

beforeEach(async () => {
  await resetTestDatabase(databases.owner);
  await seedPlansFromMigrations(databases.owner);
});

afterAll(async () => {
  await databases.closeAll();
});

/** The website allowances the Managed Website plan of migration 0180 carried, which the services plan keeps. */
const INR_ALLOWANCES = {
  includedChangeHours: 1,
  extraHourAmountCents: 50_000,
  includedPublishesPerMonth: 3,
  extraPublishAmountCents: 30_000,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 47_500,
} as const;

describe("the Brandbasket services plan", () => {
  it("is the only plan, one row per currency, both on sale", async () => {
    const rows = await querySql<{ code: string; tier: string; active: boolean }>(databases.owner, "select code, tier, active from plans");
    expect(rows.sort((a, b) => a.code.localeCompare(b.code))).toEqual([
      { code: "services-inr-2026-10", tier: "managed", active: true },
      { code: "services-usd-2026-10", tier: "managed", active: true },
    ]);
  });

  it("costs nothing of its own in rupees, with 18% GST, a one-month first term and the website allowances", async () => {
    expect(await findActivePlan(databases.staff.db, "INR", "managed")).toMatchObject({
      name: "Brandbasket services",
      tier: "managed",
      initialAmountCents: 0,
      initialTermMonths: 1,
      recurringAmountCents: 0,
      taxRateBasisPoints: 1800,
      providerPlanId: null,
      ...INR_ALLOWANCES,
    });
  });

  it("costs nothing of its own in dollars, with no tax of ours", async () => {
    expect(await findActivePlan(databases.staff.db, "USD", "managed")).toMatchObject({
      name: "Brandbasket services",
      initialAmountCents: 0,
      initialTermMonths: 1,
      recurringAmountCents: 0,
      taxRateBasisPoints: 0,
      includedChangeHours: 1,
      extraHourAmountCents: 1_000,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 300,
      extraBlogPostsAmountCents: 500,
    });
  });

  it("is what every sign-up choice buys", () => {
    for (const choice of [null, "own_website", "listing_only", "managed"] as const) expect(planTierForSignupChoice(choice)).toBe("managed");
  });
});

describe("the columns a package needs", () => {
  async function seedSubscription(): Promise<{ businessId: string; subscriptionId: string }> {
    const [business] = await querySql<{ id: string }>(
      databases.owner,
      "insert into businesses (id, slug, name, currency) values (gen_random_uuid(), 'service-plan', 'Service Plan', 'INR') returning id",
    );
    if (business === undefined) throw new Error("No business was inserted");
    const [subscription] = await querySql<{ id: string }>(
      databases.owner,
      `insert into subscriptions (id, business_id, plan_id, provider, provider_subscription_id)
       select gen_random_uuid(), '${business.id}', id, 'fake', 'sub_service_plan' from plans where code = 'services-inr-2026-10' returning id`,
    );
    if (subscription === undefined) throw new Error("No subscription was inserted");
    return { businessId: business.id, subscriptionId: subscription.id };
  }

  it("takes the website as a line on the subscription", async () => {
    const { businessId, subscriptionId } = await seedSubscription();
    await querySql(
      databases.owner,
      `insert into bundled_add_ons (id, business_id, subscription_id, add_on, list_amount_cents, net_amount_cents, tax_rate_basis_points)
       values (gen_random_uuid(), '${businessId}', '${subscriptionId}', 'managed-website', 299900, 299900, 1800) returning id`,
    );
    const rows = await querySql<{ add_on: string }>(databases.owner, "select add_on from bundled_add_ons");
    expect(rows).toEqual([{ add_on: "managed-website" }]);
  });

  it("refuses a pending offer discount that leaves the line at nothing", async () => {
    const { businessId, subscriptionId } = await seedSubscription();
    const error = await captureErrorText(
      querySql(
        databases.owner,
        `insert into bundled_add_ons (id, business_id, subscription_id, add_on, list_amount_cents, net_amount_cents, tax_rate_basis_points, pending_offer_discount_amount_cents)
         values (gen_random_uuid(), '${businessId}', '${subscriptionId}', 'managed-website', 299900, 299900, 1800, 299900) returning id`,
      ),
    );
    expect(error).toContain("bundled_add_ons_amounts_check");
  });

  it("gives a subscription no ad credit by default and refuses a negative one", async () => {
    const { subscriptionId } = await seedSubscription();
    expect(await querySql(databases.owner, `select ad_credit_cents from subscriptions where id = '${subscriptionId}'`)).toEqual([
      { ad_credit_cents: 0 },
    ]);
    const error = await captureErrorText(
      querySql(databases.owner, `update subscriptions set ad_credit_cents = -1 where id = '${subscriptionId}' returning id`),
    );
    expect(error).toContain("subscriptions_ad_credit_check");
  });

  it("leaves a business's package offer standing until it is forfeited", async () => {
    const { businessId } = await seedSubscription();
    expect(await querySql(databases.owner, `select package_offer_forfeited_at from businesses where id = '${businessId}'`)).toEqual([
      { package_offer_forfeited_at: null },
    ]);
  });
});
