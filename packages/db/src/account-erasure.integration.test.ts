import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eraseClosedAccount, erasedBusinessSlug, erasedUserEmail, findErasureBlock, listClosuresDueForErasure } from "./queries/account-erasure";
import { beginSupportAccountErasure, createSupportTicket, markSupportAttachmentPurged, stageSupportAttachment } from "./queries/support";
import { openAccountClosure, restoreAccountClosure } from "./queries/account-closures";
import { findActivePlan, insertSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import { insertTaxInvoice } from "./queries/tax-invoices";
import { supportAttachments } from "./schema/support";
import { accountClosures, accountOtps, accounts, addOnSubscriptions, billingProfiles, businessMembers, businesses, payments, sessions, staffMembers, subscriptions, userPrivacySettings, users, verifications } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const USER_ID = "closing-user";
const STAFF_ID = "a-staff-user";
const NOW = new Date("2026-12-01T12:00:00.000Z");
const CLOSED_AT = new Date("2026-10-01T12:00:00.000Z");
const ERASE_AFTER = new Date("2026-11-20T12:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

beforeAll(async () => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

async function count(table: string, where = "true"): Promise<number> {
  const result = await dbs.owner.db.execute(sql.raw(`select count(*)::int as n from ${table} where ${where}`));
  return Number((result.rows[0] as { n: number }).n);
}

/** A closed account with something in every kind of table the erase touches or keeps. */
async function seedClosedAccount(withSupport = false): Promise<{ closureId: string; subscriptionId: string }> {
  const db = dbs.owner.db;
  await db.insert(users).values({ id: USER_ID, name: "Meera Iyer", email: "meera@example.com", emailVerified: true, phoneNumber: "+919820099999", phoneNumberVerified: true });
  await db.insert(sessions).values({ id: "s1", token: "tok", expiresAt: NOW, userId: USER_ID });
  await db.insert(accounts).values({ id: "a1", accountId: USER_ID, providerId: "credential", userId: USER_ID, password: "hash" });
  await db.insert(userPrivacySettings).values({ userId: USER_ID, nomineeName: "Meera Rao", nomineePhone: "+919876543210" });
  await db.insert(verifications).values({ id: "v1", identifier: "meera@example.com", value: "x", expiresAt: NOW });
  // A sign-up code still waiting for her address, and one for somebody else's.
  await db.insert(accountOtps).values([
    { id: "00000000-0000-7000-8000-0000000000a1", purpose: "signup", email: "meera@example.com", codeHash: "h", expiresAt: NOW },
    { id: "00000000-0000-7000-8000-0000000000a2", purpose: "signup", email: "someone-else@example.com", codeHash: "h", expiresAt: NOW },
  ]);
  const [business] = await db
    .insert(businesses)
    .values({ slug: "aster-physio", name: "Aster Physio", currency: "INR", websiteUrl: "https://aster.example" })
    .returning({ id: businesses.id });
  businessId = business?.id ?? "";
  await db.insert(businessMembers).values({ businessId, userId: USER_ID, role: "owner" });

  const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const raw = (query: string) => db.execute(sql.raw(query));
  await raw(`insert into patients (id, business_id, name, phone) values ('${id(1)}', '${businessId}', 'Anil Patient', '+919811111111')`);
  await raw(`insert into practitioners (id, business_id, name, position) values ('${id(2)}', '${businessId}', 'Dr Asha', 1)`);
  await raw(`insert into leads (id, name, business_name, email, phone, business_id) values ('${id(3)}', 'Meera Iyer', 'Aster Physio', 'meera@example.com', '+919820099999', '${businessId}')`);
  await raw(`insert into setup_invites (id, lead_id, email, business_name, token_hash, expires_at, created_by_staff_id, business_id) values ('${id(4)}', '${id(3)}', 'meera@example.com', 'Aster Physio', 'hash', now(), '${STAFF_ID}', '${businessId}')`);
  await raw(`insert into media_assets (id, business_id, purpose, storage_key, original_filename, mime_type, bytes, width, height, sha256, status, uploaded_by_user_id) values ('${id(5)}', '${businessId}', 'photo', 't/${businessId}/${id(5)}/display', 'me.jpg', 'image/webp', 10, 1, 1, 'abc', 'ready', '${USER_ID}')`);
  await raw(`insert into directory_pictures (id, business_id, slot, storage_key, mime_type, bytes, width, height, sha256, uploaded_by_user_id) values ('${id(6)}', '${businessId}', 'listing', 't/${businessId}/${id(6)}/display', 'image/webp', 10, 1, 1, 'def', '${USER_ID}')`);
  await raw(`insert into directory_videos (id, business_id, slot, vimeo_id, vimeo_hash, poster_url, bytes, width, height, duration_ms, status, decided_at, decided_by_user_id, uploaded_by_user_id) values ('${id(12)}', '${businessId}', 1, '123456789', 'abc123def456', 'https://i.vimeocdn.com/video/1.jpg', 10, 1280, 720, 15000, 'approved', now(), '${USER_ID}', '${USER_ID}')`);
  // A product with its own photo: the photo is a file too, and has to be deleted with the account.
  await raw(`insert into directory_business_products (id, business_id, name, availability, photo_id, photo_mime, photo_bytes, photo_width, photo_height, photo_sha256) values ('${id(12)}', '${businessId}', 'Brush', 'in_stock', '${id(13)}', 'image/webp', 10, 800, 800, 'ghi')`);
  await raw(`insert into directory_claims (id, business_id, listing_key, business_name, phone) values ('${id(7)}', '${businessId}', 'physio/mh/thane/aster-physio', 'Aster Physio', '+919820099999')`);
  await raw(`insert into directory_business_profiles (business_id, street_address, phone) values ('${businessId}', '1 Road', '+919820099999')`);
  await raw(`insert into projects (id, business_id) values ('${id(8)}', '${businessId}')`);
  await raw(`insert into domains (id, business_id, hostname) values ('${id(9)}', '${businessId}', 'aster.example')`);
  await raw(`insert into email_messages (id, to_address, subject, template, body_text, body_html, transport) values ('${id(10)}', 'meera@example.com', 's', 't', 'b', '<p>b</p>', 'outbox')`);
  await raw(`insert into email_messages (id, to_address, subject, template, body_text, body_html, transport) values ('${id(11)}', 'someone-else@example.com', 's', 't', 'b', '<p>b</p>', 'outbox')`);

  // The money: a plan that was set to end, paid through before the erase date, and the payment it took.
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: "fake_sub_000000000000000000000001",
    referralCodeId: null,
    discountAmountCents: 0,
  });
  await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: "fake_pay_1",
    kind: "initial",
    amountCents: 100_000,
    currency: "INR",
    paidAt: CLOSED_AT,
    paidThroughAt: new Date("2026-10-20T12:00:00.000Z"),
    commitmentEndsAt: new Date("2026-10-20T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-20T12:00:00.000Z"),
  });
  await db.update(subscriptions).set({ cancelRequestedAt: CLOSED_AT, status: "cancelled", cancelledAt: new Date("2026-10-20T12:00:00.000Z") }).where(eq(subscriptions.id, subscription.id));

  // What they told us for invoices, and the invoice already issued to them.
  await db.insert(billingProfiles).values({
    businessId,
    legalName: "Aster Physio LLP",
    gstin: null,
    addressLine1: "1 Road",
    addressLine2: null,
    city: "Thane",
    postalCode: "400601",
    stateCode: "mh",
    email: "accounts@aster.example",
    phone: "+919820099999",
  });
  const [payment] = await db.select({ id: payments.id }).from(payments).where(eq(payments.businessId, businessId));
  if (payment === undefined) throw new Error("The seeded account has no payment to invoice");
  await insertTaxInvoice(dbs.staff.db, {
    businessId,
    paymentId: payment.id,
    prefix: "FY",
    financialYear: "26-27",
    serial: 1,
    number: "FY/26-27/000001",
    issuedOn: "2026-10-01",
    paidOn: "2026-10-01",
    supplier: { legalName: "Digibranders Private Limited", tradeName: "Brandbasket", gstin: null, cin: null, addressLines: ["Mumbai"], stateCode: "mh", email: null, phone: null },
    recipient: { legalName: "Aster Physio LLP", tradeName: null, gstin: null, cin: null, addressLines: ["1 Road", "Thane 400601"], stateCode: "mh", email: null, phone: null },
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "billing_address",
    supplyType: "intra_state",
    lines: [
      {
        description: "Brandbasket Premium plan",
        detail: null,
        note: null,
        sac: "998361",
        quantity: 1,
        unitAmountCents: 84_746,
        grossAmountCents: 84_746,
        discountAmountCents: 0,
        taxableCents: 84_746,
        taxRateBasisPoints: 1800,
        cgstCents: 7_627,
        sgstCents: 7_627,
        igstCents: 0,
        taxCents: 15_254,
      },
    ],
    taxableCents: 84_746,
    cgstCents: 7_627,
    sgstCents: 7_627,
    igstCents: 0,
    roundOffCents: 0,
    totalCents: 100_000,
    paymentLabel: "Payment ref fake_pay_1",
    paymentReference: "fake_pay_1",
  });

  if (withSupport) {
    const attachmentId = "00000000-0000-7000-8000-000000000099";
    await stageSupportAttachment(dbs.app.db, {id:attachmentId,userId:USER_ID,storageKey:`support/00000000-0000-7000-8000-000000000098/${attachmentId}`,filename:"private.png",mimeType:"image/webp",byteSize:10,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+60000)});
    await createSupportTicket(dbs.app.db, {userId:USER_ID,businessId,category:"bug",subject:"Private account screenshot",description:"Remove this private account screenshot.",submissionKey:"private-erasure-test",attachmentIds:[attachmentId]});
  }

  const closure = await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: CLOSED_AT, eraseAfter: ERASE_AFTER });
  return { closureId: closure.id, subscriptionId: subscription.id };
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF_ID, name: "Staff", email: "staff@example.com", emailVerified: true });
  await dbs.owner.db.insert(staffMembers).values({ userId: STAFF_ID });
  const active = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (active === null) throw new Error("No active INR plan was seeded");
  plan = active;
});

describe("listClosuresDueForErasure", () => {
  it("lists a closure once its grace period is over, and not before, nor once restored", async () => {
    const { closureId } = await seedClosedAccount();
    expect(await listClosuresDueForErasure(dbs.staff.db, new Date("2026-11-19T00:00:00.000Z"), 10)).toEqual([]);
    expect((await listClosuresDueForErasure(dbs.staff.db, NOW, 10)).map((row) => row.id)).toEqual([closureId]);
    await restoreAccountClosure(dbs.staff.db, { userId: USER_ID, now: NOW });
    expect(await listClosuresDueForErasure(dbs.staff.db, NOW, 10)).toEqual([]);
  });
});

describe("eraseClosedAccount", () => {
  it("erases what the person gave us and keeps the books", async () => {
    const { closureId, subscriptionId } = await seedClosedAccount();
    const outcome = await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW });

    expect(outcome.kind).toBe("erased");
    if (outcome.kind !== "erased") return;
    // The media asset's file, the picture's and the product photo's; the video is on Vimeo, so it comes back as an id to delete there.
    expect([...outcome.storageKeys].sort()).toHaveLength(3);
    expect(outcome.storageKeys).toContain(`t/${businessId}/00000000-0000-7000-8000-000000000013/display`);
    expect(outcome.storageKeys.every((key) => key.startsWith(`t/${businessId}/`))).toBe(true);
    expect(outcome.vimeoIds).toEqual(["123456789"]);

    for (const table of ["patients", "practitioners", "leads", "setup_invites", "media_assets", "directory_pictures", "directory_videos", "directory_claims", "directory_business_profiles", "projects", "domains", "business_members"]) {
      expect(await count(table, table === "business_members" ? `business_id = '${businessId}'` : "true"), table).toBe(0);
    }
    expect(await count("email_messages", "to_address = 'meera@example.com'")).toBe(0);
    expect(await count("email_messages", "to_address = 'someone-else@example.com'")).toBe(1);

    // Every way back in is gone, and the person is scrubbed.
    expect(await count("sessions")).toBe(0);
    expect(await count("accounts")).toBe(0);
    // The nominee is another person's number, kept only for this account's use of its rights.
    expect(await count("user_privacy_settings")).toBe(0);
    expect(await count("verifications")).toBe(0);
    expect(await count("account_otps", "email = 'meera@example.com'")).toBe(0);
    expect(await count("account_otps", "email = 'someone-else@example.com'")).toBe(1);
    const [user] = await dbs.owner.db.select().from(users).where(eq(users.id, USER_ID));
    expect(user).toMatchObject({ name: "Deleted user", email: erasedUserEmail(USER_ID), emailVerified: false, phoneNumber: null, phoneNumberVerified: false, image: null });

    // The business row stays for the books but names nobody.
    const [business] = await dbs.owner.db.select().from(businesses).where(eq(businesses.id, businessId));
    expect(business).toMatchObject({ name: "Deleted business", slug: erasedBusinessSlug(businessId), websiteUrl: null });

    // The money is untouched, and so is the invoice issued for it; the details they gave for invoices are gone.
    expect(await count("subscriptions", `id = '${subscriptionId}'`)).toBe(1);
    expect(await count("payments", `business_id = '${businessId}'`)).toBe(1);
    expect(await count("tax_invoices", `business_id = '${businessId}'`)).toBe(1);
    expect(await count("billing_profiles")).toBe(0);

    const [closure] = await dbs.owner.db.select().from(accountClosures).where(eq(accountClosures.id, closureId));
    expect(closure?.erasedAt).toEqual(NOW);
    // The staff member's own account is not touched.
    const [staff] = await dbs.owner.db.select().from(users).where(eq(users.id, STAFF_ID));
    expect(staff?.name).toBe("Staff");
  });

  it("refuses account scrubbing until private support objects are purged, then removes their content", async () => {
    const { closureId } = await seedClosedAccount(true);
    const attachmentId = "00000000-0000-7000-8000-000000000099";
    await expect(
      eraseClosedAccount(dbs.staff.db, { closureId, now: NOW }),
    ).rejects.toMatchObject({cause:{message:expect.stringContaining("purged")}});
    const [user] = await dbs.owner.db
      .select()
      .from(users)
      .where(eq(users.id, USER_ID));
    expect(user?.name).toBe("Meera Iyer");
    const deleting = await beginSupportAccountErasure(dbs.staff.db, USER_ID);
    expect(deleting.map((row) => row.id)).toEqual([attachmentId]);
    await markSupportAttachmentPurged(dbs.staff.db, attachmentId);
    const outcome = await eraseClosedAccount(dbs.staff.db, {
      closureId,
      now: NOW,
    });
    expect(outcome.kind).toBe("erased");
    expect(await count("support_tickets")).toBe(0);
    expect(await count("support_attachments")).toBe(0);
    if (outcome.kind === "erased")
      expect(
        outcome.storageKeys.every((key) => !key.startsWith("support/")),
      ).toBe(true);
  });

  it("does nothing a second time", async () => {
    const { closureId } = await seedClosedAccount();
    await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW });
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "not-due" });
  });

  it("leaves an account whose grace period is not over", async () => {
    const { closureId } = await seedClosedAccount();
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: new Date("2026-11-19T00:00:00.000Z") })).toEqual({ kind: "skipped", closureId, reason: "not-due" });
    expect(await count("patients")).toBe(1);
  });

  it("leaves an account that was restored", async () => {
    const { closureId } = await seedClosedAccount();
    await restoreAccountClosure(dbs.staff.db, { userId: USER_ID, now: new Date("2026-11-10T00:00:00.000Z") });
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "not-due" });
    expect(await count("patients")).toBe(1);
    const [user] = await dbs.owner.db.select().from(users).where(eq(users.id, USER_ID));
    expect(user?.name).toBe("Meera Iyer");
  });

  it("leaves an account whose plan is still running at the provider", async () => {
    const { closureId, subscriptionId } = await seedClosedAccount();
    await dbs.owner.db.update(subscriptions).set({ status: "active", cancelRequestedAt: null, cancelledAt: null }).where(eq(subscriptions.id, subscriptionId));
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
    expect(await count("patients")).toBe(1);
  });

  describe("with an add-on", () => {
    type AddOnRowInput = Partial<typeof addOnSubscriptions.$inferInsert>;

    /** Social media at the list price, paid for the month to 10 December 2026 and not ended, unless a test says otherwise. */
    async function seedAddOn(overrides: AddOnRowInput = {}): Promise<void> {
      await dbs.owner.db.insert(addOnSubscriptions).values({
        businessId,
        addOn: "social-media",
        listAmountCents: 1_000_000,
        discountAmountCents: 0,
        netAmountCents: 1_000_000,
        taxRateBasisPoints: 1_800,
        chargedAmountCents: 1_180_000,
        currency: "INR",
        provider: "fake",
        providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
        status: "active",
        activatedAt: new Date("2026-11-10T12:00:00.000Z"),
        currentPeriodStart: new Date("2026-11-10T12:00:00.000Z"),
        currentPeriodEnd: new Date("2026-12-10T12:00:00.000Z"),
        ...overrides,
      });
    }

    const ENDED_EARLIER = { endKind: "cancel", endRequestedAt: CLOSED_AT } as const;

    it("waits while an active add-on has not been ended", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn();
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
      expect(await count("patients")).toBe(1);
    });

    it("waits while an add-on set to cancel still has paid time left", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn(ENDED_EARLIER);
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
    });

    it("waits for an add-on that was never recorded as ended, even once its period date has passed", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn({ currentPeriodEnd: new Date("2026-11-12T12:00:00.000Z") });
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
    });

    it("waits while a past due add-on has not been ended", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn({ status: "past_due" });
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
    });

    it("waits for a kept add-on whose start date has not come, though it is not yet paid for", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn({
        status: "scheduled",
        activatedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        startAt: new Date("2026-12-15T12:00:00.000Z"),
        endKind: "cancel",
        endRequestedAt: CLOSED_AT,
      });
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
    });

    // The app asks findErasureBlock BEFORE it marks private screenshots for deletion and purges them. Marking and
    // purging cannot be undone, so a closure blocked by an add-on must reach the end of its checks with every
    // screenshot still attached and readable.
    it("blocks a closure with a live add-on before any private screenshot is touched, and erases once it has ended", async () => {
      const { closureId } = await seedClosedAccount(true);
      const attachmentId = "00000000-0000-7000-8000-000000000099";
      const states = async (): Promise<string[]> => (await dbs.owner.db.select({ state: supportAttachments.state }).from(supportAttachments).where(eq(supportAttachments.id, attachmentId))).map((row) => row.state);
      await seedAddOn();

      expect(await findErasureBlock(dbs.staff.db, { closureId, now: NOW })).toBe("subscription-live");
      expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "subscription-live" });
      expect(await states()).toEqual(["attached"]);
      expect(await count("support_tickets")).toBe(1);

      // The add-on runs out of paid time. Now the checks pass, and the order the app follows can proceed.
      await dbs.owner.db.update(addOnSubscriptions).set({ ...ENDED_EARLIER, currentPeriodEnd: new Date("2026-11-30T12:00:00.000Z") }).where(eq(addOnSubscriptions.businessId, businessId));
      expect(await findErasureBlock(dbs.staff.db, { closureId, now: NOW })).toBeNull();
      const deleting = await beginSupportAccountErasure(dbs.staff.db, USER_ID);
      expect(deleting.map((row) => row.id)).toEqual([attachmentId]);
      expect(await states()).toEqual(["deleting"]);
      await markSupportAttachmentPurged(dbs.staff.db, attachmentId);
      expect((await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).kind).toBe("erased");
      expect(await count("support_attachments")).toBe(0);
      expect(await count("support_tickets")).toBe(0);
    });

    it("erases once an add-on set to cancel has run out of paid time, and keeps the add-on row as a record", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn({ ...ENDED_EARLIER, currentPeriodEnd: new Date("2026-11-30T12:00:00.000Z") });
      expect((await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).kind).toBe("erased");
      expect(await count("add_on_subscriptions", `business_id = '${businessId}'`)).toBe(1);
    });

    it("erases when the add-ons are cancelled or were never paid for", async () => {
      const { closureId } = await seedClosedAccount();
      await seedAddOn({ status: "cancelled", endedAt: CLOSED_AT, providerSubscriptionId: `fake_sub_${"b".repeat(24)}` });
      await seedAddOn({ status: "incomplete", addOn: "advertising", activatedAt: null, currentPeriodStart: null, currentPeriodEnd: null, providerSubscriptionId: `fake_sub_${"c".repeat(24)}` });
      expect((await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).kind).toBe("erased");
    });
  });

  it("leaves a staff member's account alone", async () => {
    const { closureId } = await seedClosedAccount();
    await dbs.owner.db.insert(staffMembers).values({ userId: USER_ID });
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "staff-account" });
  });

  it("leaves a business that has another member for staff to decide", async () => {
    const { closureId } = await seedClosedAccount();
    await dbs.owner.db.insert(businessMembers).values({ businessId, userId: STAFF_ID, role: "editor" });
    expect(await eraseClosedAccount(dbs.staff.db, { closureId, now: NOW })).toEqual({ kind: "skipped", closureId, reason: "other-members" });
    expect(await count("patients")).toBe(1);
  });
});

describe("what the erase knows about", () => {
  /** Tables with a foreign key to businesses that the erase keeps on purpose: the books, and ad auction history. */
  const KEPT = [
    "account_closures", "add_on_payments", "add_on_subscriptions", "affiliate_earnings", "bundled_add_ons", "charges", "directory_ad_bids",
    "directory_ad_wins", "directory_promotions", "payments", "plan_upgrades", "press_releases", "subscriptions",
    "tax_invoices",
  ];
  /** Tables the erase empties for the business. */
  const ERASED = [
    "appointment_services", "appointment_settings", "appointments", "billing_profiles", "booking_otps", "business_announcements", "business_closures",
    "business_hours", "business_members", "business_modules", "business_profiles", "chatbot_leads", "chatbots", "directory_business_categories", "directory_business_faqs",
    "directory_business_products", "directory_business_profiles", "directory_business_services", "directory_claims",
    "directory_deals", "directory_listings", "directory_pictures", "directory_videos", "domains", "leads", "media_assets", "onboarding_progress",
    "patients", "practitioner_hours", "practitioner_leave", "practitioners", "project_briefs", "projects", "services",
    "setup_call_bookings", "setup_invites", "support_tickets",
  ];

  it("sorts every table that points at a business into erased or kept, so a new one cannot be forgotten", async () => {
    const result = await dbs.owner.db.execute(sql`
      select distinct cl.relname as child
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_class ref on ref.oid = c.confrelid
      where c.contype = 'f' and ref.relname = 'businesses'`);
    const pointing = (result.rows as { child: string }[]).map((row) => row.child).sort();
    expect(pointing).toEqual([...KEPT, ...ERASED].sort());
  });
});
