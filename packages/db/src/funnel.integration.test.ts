import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findEmail, listRecentEmails, recordEmail } from "./queries/emails";
import { createSetupInvite, findRedeemableInvite, hashInviteToken, revokeOpenInvites } from "./queries/invites";
import {
  createLead,
  findLead,
  LeadNotFoundError,
  listLeads,
  setLeadStatusUnlessSystemSet,
  SystemLeadStatusError,
  updateLead,
  type StaffLeadStatus,
} from "./queries/leads";
import {
  attachAccountToNewBusiness,
  InviteNoLongerRedeemableError,
  LeadAlreadyHasBusinessError,
  NoAccountForLeadError,
  redeemInviteIntoBusiness,
} from "./queries/onboarding";
import { businesses, businessMembers, leads, setupInvites, staffMembers, users, type BillingCurrency } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF_USER = "staff-1";

let dbs: TestDatabases;

async function seedStaff(): Promise<void> {
  await dbs.staff.db.insert(users).values({ id: STAFF_USER, name: "Sam Staff", email: "sam@firstfold.test" });
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF_USER });
}

async function seedLead(businessName = "Riverside Plumbing", currency: BillingCurrency = "USD"): Promise<string> {
  const lead = await createLead(dbs.staff.db, {
    name: "Riley Owner",
    businessName,
    email: "owner@example.com",
    phone: "+1 555 0100",
    businessType: "home_services",
    currency,
    message: "We need a new site.",
  });
  return lead.id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedStaff();
});

describe("leads", () => {
  it("stores a lead as new and lists it", async () => {
    const id = await seedLead();

    const stored = await findLead(dbs.staff.db, id);
    expect(stored).toMatchObject({
      id,
      name: "Riley Owner",
      businessName: "Riverside Plumbing",
      email: "owner@example.com",
      status: "new",
      currency: "USD",
    });
    expect((await listLeads(dbs.staff.db, {})).map((lead) => lead.id)).toEqual([id]);
  });

  it("filters by status and lists newest first", async () => {
    const first = await seedLead("First Co");
    const second = await seedLead("Second Co");
    await expect(setLeadStatusUnlessSystemSet(dbs.staff.db, second, "agreed")).resolves.toBe("updated");
    await updateLead(dbs.staff.db, second, { notes: "Wants it before June." });

    expect((await listLeads(dbs.staff.db, {})).map((lead) => lead.businessName)).toEqual(["Second Co", "First Co"]);
    expect((await listLeads(dbs.staff.db, { status: "agreed" })).map((lead) => lead.id)).toEqual([second]);
    expect((await listLeads(dbs.staff.db, { status: "new" })).map((lead) => lead.id)).toEqual([first]);
    expect(await findLead(dbs.staff.db, second)).toMatchObject({ status: "agreed", notes: "Wants it before June." });
  });

  it("returns null for an unknown lead", async () => {
    expect(await findLead(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("never moves a lead out of a status only the system sets", async () => {
    const created = await seedLead("Account Co");
    const paid = await seedLead("Paid Co");
    await dbs.staff.db.update(leads).set({ status: "account_created" }).where(eq(leads.id, created));
    await dbs.staff.db.update(leads).set({ status: "paid" }).where(eq(leads.id, paid));

    for (const status of ["lost", "invite_sent", "new"] as const) {
      await expect(setLeadStatusUnlessSystemSet(dbs.staff.db, created, status)).resolves.toBe("system-set");
      await expect(setLeadStatusUnlessSystemSet(dbs.staff.db, paid, status)).resolves.toBe("system-set");
    }
    expect(await findLead(dbs.staff.db, created)).toMatchObject({ status: "account_created" });
    expect(await findLead(dbs.staff.db, paid)).toMatchObject({ status: "paid" });
  });

  it("refuses a system status by hand, even past the type checker, and reports an unknown lead", async () => {
    const leadId = await seedLead("Sneaky Co");
    for (const status of ["paid", "account_created"]) {
      await expect(
        setLeadStatusUnlessSystemSet(dbs.staff.db, leadId, status as StaffLeadStatus),
      ).rejects.toBeInstanceOf(SystemLeadStatusError);
    }
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({ status: "new" });
    await expect(
      setLeadStatusUnlessSystemSet(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead", "lost"),
    ).resolves.toBe("not-found");
  });

  it("stores a lead through the insert-only public connection", async () => {
    // The marketing form runs as firstfold_public, which may INSERT but not SELECT: RETURNING would fail here.
    const created = await createLead(dbs.publicRole.db, {
      name: "Pat Public",
      businessName: "Public Co",
      email: "pat@example.com",
      phone: "+1 555 0199",
      businessType: "retail",
      currency: "USD",
      message: null,
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await findLead(dbs.staff.db, created.id)).toMatchObject({ businessName: "Public Co", status: "new" });
  });

  it("refuses to insert a lead through the app connection", async () => {
    const message = await captureErrorText(
      createLead(dbs.app.db, {
        name: "Nope",
        businessName: "Nope",
        email: "nope@example.com",
        phone: "1",
        businessType: "other",
        currency: "USD",
        message: null,
      }),
    );
    expect(message).toMatch(/permission denied for table leads/);
  });
});

describe("setup invites", () => {
  it("returns a token that is not stored, and finds the invite by it", async () => {
    const leadId = await seedLead();

    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.invite.tokenHash).not.toBe(created.token);

    const found = await findRedeemableInvite(dbs.staff.db, created.token);
    expect(found).toMatchObject({ id: created.invite.id, email: "owner@example.com", leadId });
  });

  it("does not find an unknown, revoked or expired invite", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(await findRedeemableInvite(dbs.staff.db, "not-a-real-token")).toBeNull();

    await revokeOpenInvites(dbs.staff.db, leadId);
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).toBeNull();

    const expired = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: -1,
    });
    expect(await findRedeemableInvite(dbs.staff.db, expired.token)).toBeNull();
  });

  it("revokes earlier invites when a new one is sent", async () => {
    const leadId = await seedLead();
    const first = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    await revokeOpenInvites(dbs.staff.db, leadId);
    const second = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(await findRedeemableInvite(dbs.staff.db, first.token)).toBeNull();
    expect(await findRedeemableInvite(dbs.staff.db, second.token)).not.toBeNull();
  });
});

describe("email outbox", () => {
  it("records a message and lists it newest first", async () => {
    await recordEmail(dbs.staff.db, {
      toAddress: "team@example.com",
      subject: "New lead: Riverside Plumbing",
      template: "lead-received",
      bodyText: "Riley Owner got in touch.",
      bodyHtml: "<p>Riley Owner got in touch.</p>",
      transport: "outbox",
    });
    await recordEmail(dbs.staff.db, {
      toAddress: "owner@example.com",
      subject: "Your Firstfold setup link",
      template: "setup-link",
      bodyText: "Set your password.",
      bodyHtml: "<p>Set your password.</p>",
      transport: "outbox",
    });

    const messages = await listRecentEmails(dbs.staff.db, 10);
    expect(messages.map((message) => message.template)).toEqual(["setup-link", "lead-received"]);
    expect(messages[0]).toMatchObject({ toAddress: "owner@example.com", transport: "outbox" });
  });
});

describe("redeemInviteIntoBusiness", () => {
  it("creates the business and owner membership, and closes the invite and lead", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });

    const result = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Riverside Plumbing",
      userId: "customer-1",
    });

    const business = await dbs.staff.db.select().from(businesses).where(eq(businesses.id, result.businessId));
    // The tenant inherits the currency staff set on the lead; the public form never sets one, so it is USD.
    expect(business[0]).toMatchObject({ name: "Riverside Plumbing", slug: "riverside-plumbing", currency: "USD" });
    const membership = await dbs.staff.db.select().from(businessMembers);
    expect(membership).toHaveLength(1);
    expect(membership[0]).toMatchObject({ businessId: result.businessId, userId: "customer-1", role: "owner" });
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).toBeNull();
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({
      status: "account_created",
      businessId: result.businessId,
    });
  });

  it("gives the business the currency staff chose on the lead", async () => {
    const leadId = await seedLead("Chennai Cafe", "INR");
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Chennai Cafe",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });

    const result = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Chennai Cafe",
      userId: "customer-1",
    });

    const business = await dbs.staff.db.select().from(businesses).where(eq(businesses.id, result.businessId));
    expect(business[0]).toMatchObject({ name: "Chennai Cafe", currency: "INR" });
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({ currency: "INR" });
  });

  it("carries a currency staff changed after the lead was captured", async () => {
    const leadId = await seedLead("Late Switch Co");
    await setLeadStatusUnlessSystemSet(dbs.staff.db, leadId, "agreed");
    await updateLead(dbs.staff.db, leadId, { currency: "INR" });
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Late Switch Co",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });

    const result = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Late Switch Co",
      userId: "customer-1",
    });

    const business = await dbs.staff.db.select().from(businesses).where(eq(businesses.id, result.businessId));
    expect(business[0]).toMatchObject({ currency: "INR" });
  });

  it("gives the second business with the same name a distinct slug", async () => {
    const firstLead = await seedLead();
    const secondLead = await seedLead();
    const firstInvite = await createSetupInvite(dbs.staff.db, {
      leadId: firstLead,
      email: "one@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    const secondInvite = await createSetupInvite(dbs.staff.db, {
      leadId: secondLead,
      email: "two@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values([
      { id: "customer-a", name: "One", email: "one@example.com" },
      { id: "customer-b", name: "Two", email: "two@example.com" },
    ]);

    const first = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: firstInvite.invite.id,
      leadId: firstLead,
      businessName: "Riverside Plumbing",
      userId: "customer-a",
    });
    const second = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: secondInvite.invite.id,
      leadId: secondLead,
      businessName: "Riverside Plumbing",
      userId: "customer-b",
    });

    const rows = await dbs.staff.db.select({ id: businesses.id, slug: businesses.slug }).from(businesses);
    const slugs = rows.map((row) => row.slug).sort();
    expect(slugs[0]).toBe("riverside-plumbing");
    expect(slugs[1]).toMatch(/^riverside-plumbing-[a-z0-9]{6}$/);
    expect(first.businessId).not.toBe(second.businessId);
  });
});

describe("redeeming the same invite twice", () => {
  it("creates one business and refuses the second attempt", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });

    const redemption = {
      inviteId: created.invite.id,
      leadId,
      businessName: "Riverside Plumbing",
      userId: "customer-1",
    };
    await redeemInviteIntoBusiness(dbs.staff.db, redemption);

    await expect(redeemInviteIntoBusiness(dbs.staff.db, redemption)).rejects.toBeInstanceOf(
      InviteNoLongerRedeemableError,
    );
    expect(await dbs.staff.db.select({ id: businesses.id }).from(businesses)).toHaveLength(1);
    expect(await dbs.staff.db.select({ businessId: businessMembers.businessId }).from(businessMembers)).toHaveLength(1);
  });

  it("stores only the hash of a token", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(created.invite.tokenHash).toBe(hashInviteToken(created.token));
  });

  it("finds a recorded email by id", async () => {
    await recordEmail(dbs.staff.db, {
      toAddress: "owner@example.com",
      subject: "Your Firstfold setup link",
      template: "setup-link",
      bodyText: "Set your password.",
      bodyHtml: "<p>Set your password.</p>",
      transport: "outbox",
    });

    const [stored] = await listRecentEmails(dbs.staff.db, 1);
    if (stored === undefined) throw new Error("Expected a recorded email");
    expect(await findEmail(dbs.staff.db, stored.id)).toMatchObject({ subject: "Your Firstfold setup link" });
    expect(await findEmail(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
  });
});

describe("recovering a redemption that failed after the account was created", () => {
  it("redeems the same invite for the account the first attempt left behind", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    // The account is committed first and the redemption is a separate transaction, so it can fail on its own.
    // An unknown user id makes the membership insert violate its foreign key, exactly as a mid-flight fault would.
    await expect(
      redeemInviteIntoBusiness(dbs.staff.db, {
        inviteId: created.invite.id,
        leadId,
        businessName: "Riverside Plumbing",
        userId: "never-created",
      }),
    ).rejects.toThrow();
    expect(await dbs.staff.db.select({ id: businesses.id }).from(businesses)).toHaveLength(0);
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).not.toBeNull();

    // The customer opens the same link again; the account from the failed attempt is reused rather than recreated.
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });
    const result = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Riverside Plumbing",
      userId: "customer-1",
    });

    const membership = await dbs.staff.db.select().from(businessMembers);
    expect(membership).toHaveLength(1);
    expect(membership[0]).toMatchObject({ businessId: result.businessId, userId: "customer-1", role: "owner" });
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).toBeNull();
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({ status: "account_created" });
  });
});

describe("attachAccountToNewBusiness", () => {
  async function seedStrandedAccount(): Promise<{ readonly leadId: string; readonly token: string }> {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "OWNER@example.com" });
    return { leadId, token: created.token };
  }

  it("creates the business, makes the account its owner and records the staff member", async () => {
    const { leadId, token } = await seedStrandedAccount();

    const result = await attachAccountToNewBusiness(dbs.staff.db, { leadId, attachedByStaffId: STAFF_USER });

    expect(result.businessName).toBe("Riverside Plumbing");
    const business = await dbs.staff.db.select().from(businesses).where(eq(businesses.id, result.businessId));
    expect(business[0]).toMatchObject({ name: "Riverside Plumbing", slug: "riverside-plumbing" });
    const membership = await dbs.staff.db.select().from(businessMembers);
    expect(membership).toHaveLength(1);
    expect(membership[0]).toMatchObject({ businessId: result.businessId, userId: "customer-1", role: "owner" });
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({
      status: "account_created",
      businessId: result.businessId,
      attachedByStaffId: STAFF_USER,
    });
    // A link still open would otherwise redeem into a second business for the same lead.
    expect(await findRedeemableInvite(dbs.staff.db, token)).toBeNull();
    const invites = await dbs.staff.db.select({ revokedAt: setupInvites.revokedAt }).from(setupInvites);
    expect(invites[0]?.revokedAt).not.toBeNull();
  });

  it("refuses a lead that already has a business, leaving the first one alone", async () => {
    const { leadId } = await seedStrandedAccount();
    const first = await attachAccountToNewBusiness(dbs.staff.db, { leadId, attachedByStaffId: STAFF_USER });

    await expect(
      attachAccountToNewBusiness(dbs.staff.db, { leadId, attachedByStaffId: STAFF_USER }),
    ).rejects.toBeInstanceOf(LeadAlreadyHasBusinessError);

    const rows = await dbs.staff.db.select({ id: businesses.id }).from(businesses);
    expect(rows).toEqual([{ id: first.businessId }]);
    expect(await dbs.staff.db.select().from(businessMembers)).toHaveLength(1);
  });

  it("refuses a lead whose email has no account, and an unknown lead", async () => {
    const leadId = await seedLead();

    await expect(
      attachAccountToNewBusiness(dbs.staff.db, { leadId, attachedByStaffId: STAFF_USER }),
    ).rejects.toBeInstanceOf(NoAccountForLeadError);
    await expect(
      attachAccountToNewBusiness(dbs.staff.db, {
        leadId: "0192f3c4-0000-7000-8000-00000000dead",
        attachedByStaffId: STAFF_USER,
      }),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
    expect(await dbs.staff.db.select({ id: businesses.id }).from(businesses)).toHaveLength(0);
  });
});
