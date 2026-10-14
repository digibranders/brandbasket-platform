import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { changeLeadCurrency, createLead, isBillingStarted } from "./queries/leads";
import { createReferralCode } from "./queries/referrals";
import { businesses, leads, users } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user-currency";

let dbs: TestDatabases;
let leadId = "";
let businessId = "";

async function leadCurrency(): Promise<string | undefined> {
  const rows = await dbs.owner.db.select({ currency: leads.currency }).from(leads).where(eq(leads.id, leadId));
  return rows[0]?.currency;
}

async function business(): Promise<{ currency: string; referralCodeId: string | null } | undefined> {
  const rows = await dbs.owner.db
    .select({ currency: businesses.currency, referralCodeId: businesses.referralCodeId })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return rows[0];
}

/** The customer has redeemed their setup link: the lead now points at the business it created. */
async function signUp(): Promise<void> {
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "firsfold-test", name: "Firsfold", currency: "USD" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  await dbs.owner.db.update(leads).set({ businessId, status: "account_created" }).where(eq(leads.id, leadId));
}

async function startCheckout(): Promise<void> {
  const plan = await findActivePlan(dbs.staff.db, "USD", "premium");
  if (plan === null) throw new Error("no USD plan seeded");
  await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: "fake_sub_currency",
    referralCodeId: null,
    discountAmountCents: 0,
  });
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Staff", email: "staff@example.com", emailVerified: true });
  const created = await createLead(dbs.staff.db, {
    name: "Siddique",
    businessName: "Firsfold",
    email: "siddique@example.com",
    phone: "+919876543210",
    businessType: "salon",
    currency: "USD",
    message: null,
  });
  leadId = created.id;
  businessId = "";
});

describe("changeLeadCurrency", () => {
  it("changes the lead before the customer has signed up", async () => {
    await expect(changeLeadCurrency(dbs.staff.db, leadId, "INR")).resolves.toBe("changed");

    expect(await leadCurrency()).toBe("INR");
  });

  /** The bug this fixes: the lead said INR, the business it billed from still said USD, and checkout read the business. */
  it("changes the business with the lead once the customer has signed up, before anything is billed", async () => {
    await signUp();

    await expect(changeLeadCurrency(dbs.staff.db, leadId, "INR")).resolves.toBe("changed");

    expect(await leadCurrency()).toBe("INR");
    expect(await business()).toMatchObject({ currency: "INR" });
  });

  it("removes a referral code applied in the old currency, whose flat discount would not fit the new one", async () => {
    await signUp();
    const code = await createReferralCode(dbs.staff.db, {
      code: "SAVE10",
      currency: "USD",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 750 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF_USER,
    });
    await dbs.owner.db.update(businesses).set({ referralCodeId: code.id }).where(eq(businesses.id, businessId));

    await changeLeadCurrency(dbs.staff.db, leadId, "INR");

    expect(await business()).toEqual({ currency: "INR", referralCodeId: null });
  });

  it("refuses once billing has started, and changes neither the lead nor the business", async () => {
    await signUp();
    await startCheckout();

    await expect(changeLeadCurrency(dbs.staff.db, leadId, "INR")).resolves.toBe("locked");

    expect(await leadCurrency()).toBe("USD");
    expect(await business()).toMatchObject({ currency: "USD" });
  });

  it("reports nothing to do when lead and business already bill in that currency", async () => {
    await signUp();

    await expect(changeLeadCurrency(dbs.staff.db, leadId, "USD")).resolves.toBe("unchanged");
  });

  /** A lead the old bug left saying INR over a USD business: saving INR again must repair the business. */
  it("brings the business into line when only the lead was changed before", async () => {
    await signUp();
    await dbs.owner.db.update(leads).set({ currency: "INR" }).where(eq(leads.id, leadId));

    await expect(changeLeadCurrency(dbs.staff.db, leadId, "INR")).resolves.toBe("changed");

    expect(await business()).toMatchObject({ currency: "INR" });
  });

  it("reports a lead that does not exist", async () => {
    await expect(changeLeadCurrency(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead", "INR")).resolves.toBe(
      "not-found",
    );
  });
});

describe("isBillingStarted", () => {
  it("is false until a subscription exists, then true", async () => {
    await signUp();
    expect(await isBillingStarted(dbs.staff.db, businessId)).toBe(false);

    await startCheckout();

    expect(await isBillingStarted(dbs.staff.db, businessId)).toBe(true);
  });
});
