import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BillingBusinessNotFoundError,
  findActivePlan,
  findBillingState,
  findFirstPayment,
  findSubscriptionByProviderId,
  findLatestSubscriptionForBusiness,
  insertSubscription,
  InvalidManualPaymentError,
  lockBusinessForBilling,
  openCheckoutSubscription,
  recordPaymentAndActivate,
  StaleSubscriptionChangedError,
  type PaymentActivation,
  type Plan,
} from "./queries/billing";
import { listClients } from "./queries/clients";
import { createSetupInvite } from "./queries/invites";
import { markLeadPaidForBusiness } from "./queries/leads";
import { listMediaAssets } from "./queries/media";
import {
  getBusinessHours,
  getBusinessProfile,
  getPrimaryDomain,
  getProjectBrief,
  listServices,
  listStepProgress,
  markStepComplete,
  replaceServices,
  saveBusinessProfile,
  savePrimaryDomain,
} from "./queries/onboarding-data";
import { findOpenProject, submitProject } from "./queries/projects";
import {
  businesses,
  businessMembers,
  leads,
  payments,
  plans,
  projects,
  setupInvites,
  staffMembers,
  subscriptions,
  users,
} from "./schema";
import { withCustomerRole, withTenantScope, type ScopedTransaction } from "./scope";
import {
  captureErrorText,
  openTestDatabases,
  resetTestDatabase,
  seedPlansFromMigrations,
  type TestDatabases,
} from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";
const STAFF_USER = "staff-1";
const PAID_AT = new Date("2026-09-16T10:00:00.000Z");
const THREE_MONTHS_ON = new Date("2026-12-16T10:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let projectA = "";
let projectB = "";

const scopeA = (): { userId: string; businessId: string } => ({ userId: USER_A, businessId: businessA });

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

async function usdPlan(): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, "USD", "premium");
  if (plan === null) throw new Error("No USD plan was seeded");
  return plan;
}

async function openCheckout(businessId: string, providerSubscriptionId: string): Promise<string> {
  const plan = await usdPlan();
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
  });
  return subscription.id;
}

async function activation(subscriptionId: string, providerPaymentId: string): Promise<PaymentActivation> {
  const plan = await usdPlan();
  return {
    businessId: businessA,
    subscriptionId,
    provider: "fake",
    providerPaymentId,
    kind: "initial",
    amountCents: plan.initialAmountCents,
    currency: plan.currency,
    paidAt: PAID_AT,
    paidThroughAt: THREE_MONTHS_ON,
    commitmentEndsAt: THREE_MONTHS_ON,
    currentPeriodEnd: THREE_MONTHS_ON,
  };
}

async function projectStatus(projectId: string): Promise<string | undefined> {
  const rows = await dbs.staff.db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  return rows[0]?.status;
}

async function leadStatus(leadId: string): Promise<string | undefined> {
  const rows = await dbs.staff.db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
  return rows[0]?.status;
}

async function paymentCount(): Promise<number> {
  return (await dbs.staff.db.select({ id: payments.id }).from(payments)).length;
}

async function insertLead(businessId: string | null, email: string): Promise<string> {
  const [lead] = await dbs.staff.db
    .insert(leads)
    .values({ name: "Ana", businessName: "Riverside", email, phone: "+1 555 0100", businessId, status: "account_created" })
    .returning({ id: leads.id });
  if (lead === undefined) throw new Error("Lead was not inserted");
  return lead.id;
}

/** What the connection is acting as right now, read from inside the transaction. */
async function whoAmI(tx: ScopedTransaction): Promise<{ role: string; business: string | null }> {
  const result = await tx.execute<{ role: string; business: string | null }>(
    sql`select current_user as role, app_current_business_id()::text as business`,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("No row from current_user");
  return row;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
    { id: STAFF_USER, name: "Sam Staff", email: "sam@brandbasket.example" },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF_USER });
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing", currency: "USD" },
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-plumbing");
  businessB = idForSlug(inserted, "chennai-cafe");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
  const projectRows = await dbs.staff.db
    .insert(projects)
    .values([{ businessId: businessA }, { businessId: businessB }])
    .returning({ id: projects.id, businessId: projects.businessId });
  projectA = projectRows.find((row) => row.businessId === businessA)?.id ?? "";
  projectB = projectRows.find((row) => row.businessId === businessB)?.id ?? "";
});

describe("withCustomerRole", () => {
  it("acts as the customer's role and business inside, and as staff again afterwards", async () => {
    const seen = await dbs.staff.db.transaction(async (tx) => {
      const before = await whoAmI(tx);
      const inside = await withCustomerRole(tx, scopeA(), whoAmI);
      const after = await whoAmI(tx);
      return { before, inside, after };
    });

    expect(seen.before).toEqual({ role: "bb_staff", business: null });
    expect(seen.inside).toEqual({ role: "bb_app", business: businessA });
    expect(seen.after).toEqual({ role: "bb_staff", business: null });
  });

  it("restores the staff role when the work fails, and the outer transaction carries on", async () => {
    const after = await dbs.staff.db.transaction(async (tx) => {
      await expect(
        withCustomerRole(tx, scopeA(), async () => Promise.reject(new Error("refused inside"))),
      ).rejects.toThrow("refused inside");
      return whoAmI(tx);
    });
    expect(after).toEqual({ role: "bb_staff", business: null });
  });

  it("commits a payment and a customer submission together", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    const leadId = await insertLead(businessA, "ana@example.com");

    await dbs.staff.db.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessA);
      await recordPaymentAndActivate(tx, await activation(subscriptionId, "fake_pay_a"));
      await withCustomerRole(tx, scopeA(), async (customerTx) => {
        const project = await findOpenProject(customerTx);
        if (project === null) throw new Error("Customer could not see their project");
        await submitProject(customerTx, { projectId: project.id, now: PAID_AT });
      });
    });

    expect(await paymentCount()).toBe(1);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      status: "active",
      paidThroughAt: THREE_MONTHS_ON,
    });
    expect(await projectStatus(projectA)).toBe("submitted");
    expect(await leadStatus(leadId)).toBe("paid");
  });

  it("keeps the payment when the submission inside is rolled back", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");

    await dbs.staff.db.transaction(async (tx) => {
      await recordPaymentAndActivate(tx, await activation(subscriptionId, "fake_pay_a"));
      // As the confirm step does when the checklist fails after the status change: the savepoint is undone.
      await withCustomerRole(tx, scopeA(), async (customerTx) => {
        await submitProject(customerTx, { projectId: projectA, now: PAID_AT });
        throw new Error("checklist failed");
      }).catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "checklist failed") throw error;
      });
    });

    expect(await paymentCount()).toBe(1);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ status: "active" });
    expect(await projectStatus(projectA)).toBe("onboarding");
  });

  it("rolls back the payment and the submission together when the outer transaction fails", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");

    await expect(
      dbs.staff.db.transaction(async (tx) => {
        await recordPaymentAndActivate(tx, await activation(subscriptionId, "fake_pay_a"));
        await withCustomerRole(tx, scopeA(), (customerTx) =>
          submitProject(customerTx, { projectId: projectA, now: PAID_AT }),
        );
        throw new Error("commit never happens");
      }),
    ).rejects.toThrow("commit never happens");

    expect(await paymentCount()).toBe(0);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ status: "incomplete" });
    expect(await projectStatus(projectA)).toBe("onboarding");
  });

  it("holds the work to the customer's own rows and to the one transition customers may make", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");

    await dbs.staff.db.transaction(async (tx) => {
      // Another tenant's project is invisible, exactly as on the app connection.
      await withCustomerRole(tx, scopeA(), async (customerTx) => {
        const visible = await customerTx.select({ id: projects.id }).from(projects);
        expect(visible.map((row) => row.id)).toEqual([projectA]);
      });
    });

    const billingWrite = await captureErrorText(
      dbs.staff.db.transaction((tx) =>
        withCustomerRole(tx, scopeA(), (customerTx) =>
          customerTx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, subscriptionId)),
        ),
      ),
    );
    expect(billingWrite).toMatch(/permission denied/);

    const otherTransition = await captureErrorText(
      dbs.staff.db.transaction((tx) =>
        withCustomerRole(tx, scopeA(), (customerTx) =>
          customerTx.update(projects).set({ status: "building" }).where(eq(projects.id, projectA)),
        ),
      ),
    );
    expect(otherTransition).toMatch(/may only move a project from onboarding to submitted/);

    const otherTenant = await dbs.staff.db.transaction((tx) =>
      withCustomerRole(tx, scopeA(), (customerTx) =>
        customerTx
          .update(projects)
          .set({ status: "submitted" })
          .where(eq(projects.id, projectB))
          .returning({ id: projects.id }),
      ),
    );
    expect(otherTenant).toEqual([]);
    expect(await projectStatus(projectB)).toBe("onboarding");
  });

  it("reads the customer's saved answers exactly as the app connection does, and nobody else's", async () => {
    for (const [scope, name, host] of [
      [scopeA(), "Riverside Plumbing", "riverside.example"],
      [{ userId: USER_B, businessId: businessB }, "Chennai Cafe", "chennai.example"],
    ] as const) {
      await withTenantScope(dbs.app.db, scope, async (tx) => {
        await saveBusinessProfile(tx, {
          displayName: name,
          tagline: null,
          description: null,
          phone: "+1 555 0100",
          email: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
          serviceAreas: null,
          googleBusinessUrl: null,
        });
        await replaceServices(tx, [{ name: `${name} service`, summary: null, priceText: null }]);
        await savePrimaryDomain(tx, { hostname: host, ownerConfirmedAt: PAID_AT });
        const project = await findOpenProject(tx);
        if (project === null) throw new Error("no project");
        await markStepComplete(tx, project.id, "business");
      });
    }

    const read = await dbs.staff.db.transaction((tx) =>
      withCustomerRole(tx, scopeA(), async (customerTx) => {
        const project = await findOpenProject(customerTx);
        if (project === null) throw new Error("no project");
        return {
          project: project.id,
          progress: (await listStepProgress(customerTx, project.id)).map((entry) => entry.step),
          profile: (await getBusinessProfile(customerTx))?.displayName,
          hours: await getBusinessHours(customerTx),
          services: (await listServices(customerTx)).map((service) => service.name),
          brief: await getProjectBrief(customerTx, project.id),
          domain: (await getPrimaryDomain(customerTx))?.hostname,
          media: await listMediaAssets(customerTx, "photo"),
        };
      }),
    );

    expect(read).toEqual({
      project: projectA,
      progress: ["business"],
      profile: "Riverside Plumbing",
      hours: [],
      services: ["Riverside Plumbing service"],
      brief: null,
      domain: "riverside.example",
      media: [],
    });
  });

  it("gives the customer connection no way to become staff", async () => {
    const message = await captureErrorText(
      dbs.app.db.transaction((tx) => tx.execute(sql`set local role bb_staff`)),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("lends the staff role none of the customer role's policies without the explicit switch", async () => {
    const rows = await dbs.owner.db.execute<{ inherit: boolean }>(
      sql`select rolinherit as inherit from pg_roles where rolname = 'bb_staff'`,
    );
    expect(rows.rows[0]?.inherit).toBe(false);
  });

  it("refuses a malformed business id before switching", async () => {
    await expect(
      dbs.staff.db.transaction((tx) => withCustomerRole(tx, { userId: USER_A, businessId: "nope" }, whoAmI)),
    ).rejects.toThrow(/UUID/);
  });
});

describe("marking the lead paid", () => {
  it("finds a staff-attached lead through leads.business_id, with no invite", async () => {
    const leadId = await insertLead(businessA, "ana@example.com");

    expect(await markLeadPaidForBusiness(dbs.staff.db, businessA)).toBe(1);
    expect(await leadStatus(leadId)).toBe("paid");
    expect(await dbs.staff.db.select({ id: setupInvites.id }).from(setupInvites)).toEqual([]);
  });

  it("finds a lead through its redeemed setup invite", async () => {
    const leadId = await insertLead(null, "ana@example.com");
    const { invite } = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "ana@example.com",
      businessName: "Riverside",
      expiresInDays: 7,
      createdByStaffId: STAFF_USER,
    });
    await dbs.staff.db.update(setupInvites).set({ businessId: businessA }).where(eq(setupInvites.id, invite.id));

    expect(await markLeadPaidForBusiness(dbs.staff.db, businessA)).toBe(1);
    expect(await leadStatus(leadId)).toBe("paid");
  });

  it("leaves other businesses' leads alone, and changes nothing the second time", async () => {
    const mine = await insertLead(businessA, "ana@example.com");
    const theirs = await insertLead(businessB, "ben@example.com");

    expect(await markLeadPaidForBusiness(dbs.staff.db, businessA)).toBe(1);
    expect(await markLeadPaidForBusiness(dbs.staff.db, businessA)).toBe(0);
    expect(await leadStatus(mine)).toBe("paid");
    expect(await leadStatus(theirs)).toBe("account_created");
  });

  it("is done by a first payment and not by a renewal", async () => {
    const leadId = await insertLead(businessA, "ana@example.com");
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");

    const renewal = await recordPaymentAndActivate(dbs.staff.db, {
      ...(await activation(subscriptionId, "fake_pay_renewal")),
      kind: "renewal",
    });
    expect(renewal.leadsMarkedPaid).toBe(0);
    expect(await leadStatus(leadId)).toBe("account_created");

    const first = await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));
    expect(first.leadsMarkedPaid).toBe(1);
    expect(await leadStatus(leadId)).toBe("paid");

    const again = await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));
    expect(again).toMatchObject({ alreadyRecorded: true, leadsMarkedPaid: 0 });
  });
});

describe("openCheckoutSubscription", () => {
  it("cancels the stale unpaid checkout and opens the new one in one go", async () => {
    const plan = await usdPlan();
    const stale = await openCheckout(businessA, "fake_sub_old");

    const fresh = await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_new",
      replacing: stale,
      now: PAID_AT,
    });

    expect(fresh).toMatchObject({ status: "incomplete", providerSubscriptionId: "fake_sub_new" });
    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_old")).toMatchObject({
      id: stale,
      status: "cancelled",
      cancelledAt: PAID_AT,
    });
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ id: fresh.id });
  });

  it("never cancels a subscription that was paid for in the meantime", async () => {
    const plan = await usdPlan();
    const paid = await openCheckout(businessA, "fake_sub_paid");
    await recordPaymentAndActivate(dbs.staff.db, await activation(paid, "fake_pay_paid"));

    await expect(
      openCheckoutSubscription(dbs.staff.db, {
        businessId: businessA,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: "fake_sub_new",
        replacing: paid,
        now: PAID_AT,
      }),
    ).rejects.toBeInstanceOf(StaleSubscriptionChangedError);

    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ id: paid, status: "active" });
    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_new")).toBeNull();
  });

  it("ends a lapsed subscription and opens the new one, leaving its dates alone", async () => {
    const plan = await usdPlan();
    const lapsed = await openCheckout(businessA, "fake_sub_lapsed");
    await recordPaymentAndActivate(dbs.staff.db, await activation(lapsed, "fake_pay_lapsed"));
    const afterPeriod = new Date(THREE_MONTHS_ON.getTime() + 1);

    const fresh = await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_back",
      replacing: lapsed,
      now: afterPeriod,
    });

    expect(fresh).toMatchObject({ status: "incomplete", providerSubscriptionId: "fake_sub_back" });
    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_lapsed")).toMatchObject({
      status: "cancelled",
      cancelledAt: afterPeriod,
      paidThroughAt: THREE_MONTHS_ON,
    });
  });

  it("ends a halted subscription even inside its paid period, since it grants no access", async () => {
    const plan = await usdPlan();
    const halted = await openCheckout(businessA, "fake_sub_halted");
    await recordPaymentAndActivate(dbs.staff.db, await activation(halted, "fake_pay_halted"));
    await dbs.staff.db.update(subscriptions).set({ status: "inactive" }).where(eq(subscriptions.id, halted));

    await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_back",
      replacing: halted,
      now: PAID_AT,
    });

    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_halted")).toMatchObject({ status: "cancelled" });
  });

  it("refuses to cancel another business's checkout", async () => {
    const plan = await usdPlan();
    const theirs = await openCheckout(businessB, "fake_sub_theirs");

    await expect(
      openCheckoutSubscription(dbs.staff.db, {
        businessId: businessA,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: "fake_sub_new",
        replacing: theirs,
        now: PAID_AT,
      }),
    ).rejects.toBeInstanceOf(StaleSubscriptionChangedError);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessB)).toMatchObject({ status: "incomplete" });
  });

  it("still refuses a second live subscription when nothing is being replaced", async () => {
    const plan = await usdPlan();
    await openCheckout(businessA, "fake_sub_old");

    const message = await captureErrorText(
      openCheckoutSubscription(dbs.staff.db, {
        businessId: businessA,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: "fake_sub_new",
        replacing: null,
        now: PAID_AT,
      }),
    );
    expect(message).toMatch(/subscriptions_one_live_per_business_idx/);
  });

  it("records a manual subscription and payment", async () => {
    const plan = await usdPlan();
    const manual = await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "manual",
      providerSubscriptionId: "manual_sub_1",
      replacing: null,
      now: PAID_AT,
    });
    const base = { ...(await activation(manual.id, "manual_pay_1")), provider: "manual" as const };
    await expect(recordPaymentAndActivate(dbs.staff.db, base)).rejects.toBeInstanceOf(InvalidManualPaymentError);
    await expect(
      recordPaymentAndActivate(dbs.staff.db, {
        ...base,
        manual: { recordedByStaffId: STAFF_USER, reference: " padded ", receivedOn: "2026-09-15" },
      }),
    ).rejects.toBeInstanceOf(InvalidManualPaymentError);
    await expect(
      recordPaymentAndActivate(dbs.staff.db, {
        ...(await activation(manual.id, "fake_pay_1")),
        manual: { recordedByStaffId: STAFF_USER, reference: "BANK-1", receivedOn: "2026-09-15" },
      }),
    ).rejects.toBeInstanceOf(InvalidManualPaymentError);
    expect(await paymentCount()).toBe(0);

    await recordPaymentAndActivate(dbs.staff.db, {
      ...base,
      manual: { recordedByStaffId: STAFF_USER, reference: "HDFC-UTR-42", receivedOn: "2026-09-15" },
    });

    expect(await findFirstPayment(dbs.staff.db, businessA)).toMatchObject({
      provider: "manual",
      amountCents: 6900,
      paidAt: PAID_AT,
    });
    const stored = await dbs.staff.db
      .select({
        recordedBy: payments.recordedByStaffId,
        reference: payments.manualReference,
        receivedOn: payments.receivedOn,
      })
      .from(payments);
    expect(stored).toEqual([{ recordedBy: STAFF_USER, reference: "HDFC-UTR-42", receivedOn: "2026-09-15" }]);
  });
});

describe("lockBusinessForBilling", () => {
  it("refuses a business that does not exist", async () => {
    await expect(
      dbs.staff.db.transaction((tx) => lockBusinessForBilling(tx, "0192f3c4-0000-7000-8000-00000000dead")),
    ).rejects.toBeInstanceOf(BillingBusinessNotFoundError);
    await expect(dbs.staff.db.transaction((tx) => lockBusinessForBilling(tx, "not-a-uuid"))).rejects.toBeInstanceOf(
      BillingBusinessNotFoundError,
    );
  });

  it("makes a second billing change for the same business wait, but not one for another business", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const holder = dbs.staff.db.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessA);
      locked();
      await held;
    });
    await lockTaken;

    try {
      const blocked = await captureErrorText(
        dbs.staff.db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '200ms'`);
          await lockBusinessForBilling(tx, businessA);
        }),
      );
      expect(blocked).toMatch(/lock timeout/);

      await dbs.staff.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await lockBusinessForBilling(tx, businessB);
      });
    } finally {
      release();
      await holder;
    }
  });
});

describe("findBillingState", () => {
  it("reads the customer's own state through row-level security, and nothing of another business", async () => {
    await openCheckout(businessA, "fake_sub_a");

    const own = await withTenantScope(dbs.app.db, scopeA(), (tx) => findBillingState(tx, businessA));
    expect(own).toMatchObject({
      currency: "USD",
      subscription: { status: "incomplete", providerSubscriptionId: "fake_sub_a" },
      plan: { code: "care-usd-2026-09", initialAmountCents: 6900, initialTermMonths: 1 },
    });

    const other = await withTenantScope(dbs.app.db, scopeA(), (tx) => findBillingState(tx, businessB));
    expect(other).toBeNull();
  });

  it("offers the active plan for the business's currency before any checkout", async () => {
    const state = await withTenantScope(dbs.app.db, { userId: USER_B, businessId: businessB }, (tx) =>
      findBillingState(tx, businessB),
    );
    expect(state).toMatchObject({
      currency: "INR",
      subscription: null,
      plan: { code: "premium-inr-2026-10-9999", initialAmountCents: 999900, taxRateBasisPoints: 1800, initialTermMonths: 1 },
    });
  });

  it("keeps the price a subscription was sold at after that plan is retired", async () => {
    const plan = await usdPlan();
    await openCheckout(businessA, "fake_sub_a");
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.id, plan.id));
    await dbs.owner.db.insert(plans).values({
      code: "care-usd-2027",
      name: "Brandbasket care plan",
      currency: "USD",
      initialAmountCents: 30000,
      taxRateBasisPoints: 0,
      initialTermMonths: 3,
      recurringAmountCents: 10000,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 300,
    });

    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ plan: { id: plan.id } });
  });
});

describe("listClients billing", () => {
  it("shows who has paid, what and when, and the live subscription, and leaves out a checkout that was opened but not paid", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));
    await openCheckout(businessB, "fake_sub_b");

    const clients = await listClients(dbs.staff.db);
    const paid = clients.find((client) => client.businessId === businessA);
    const unpaid = clients.find((client) => client.businessId === businessB);

    expect(paid?.billing).toEqual({
      subscription: {
        status: "active",
        provider: "fake",
        activatedAt: PAID_AT,
        paidThroughAt: THREE_MONTHS_ON,
        commitmentEndsAt: THREE_MONTHS_ON,
      },
      firstPayment: { amountCents: 6900, currency: "USD", provider: "fake", paidAt: PAID_AT, manual: null },
    });
    // Opening a checkout does not make a client; paying does.
    expect(unpaid).toBeUndefined();
  });
});
