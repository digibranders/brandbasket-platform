import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findClientDetail, findMediaForStaff, listBusinessMembersForStaff, listClients, renameBusinessOwner } from "./queries/clients";
import { insertMediaAsset, newMediaAssetId, softDeleteMediaAsset } from "./queries/media";
import {
  markStepComplete,
  replaceBusinessHours,
  replaceServices,
  saveBusinessProfile,
  savePrimaryDomain,
  saveProjectBrief,
} from "./queries/onboarding-data";
import { submitProject } from "./queries/projects";
import { businesses, businessMembers, payments, plans, projects, users, type PaymentKind, type PaymentStatus } from "./schema";
import { insertSubscription } from "./queries/billing";
import { openAccountClosure } from "./queries/account-closures";
import { phoneAccountEmail } from "./phone-account";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-1";
const SUBMITTED_AT = new Date("2026-09-16T09:30:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let projectId = "";

function asOwner<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
}

let paymentSequence = 0;

/** One payment for a business. By default the captured first plan payment, which is what makes a business a client. */
async function recordPayment(id: string, kind: PaymentKind = "initial", status: PaymentStatus = "captured"): Promise<void> {
  paymentSequence += 1;
  await dbs.staff.db.insert(payments).values({
    businessId: id,
    provider: "fake",
    providerPaymentId: `pay_clients_test_${String(paymentSequence)}`,
    kind,
    amountCents: 299_900,
    currency: "INR",
    status,
    paidAt: status === "captured" ? new Date("2026-09-16T10:00:00.000Z") : null,
  });
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: OWNER, name: "Riley Owner", email: "riley@example.com" });
  const [business] = await dbs.staff.db
    .insert(businesses)
    .values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" })
    .returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  businessId = business.id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
  await recordPayment(businessId);
  const [project] = await dbs.staff.db.insert(projects).values({ businessId }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  projectId = project.id;
});

describe("a client's plan", () => {
  it("is Managed Website for a business that has not subscribed, whatever it chose", async () => {
    expect((await listClients(dbs.staff.db))[0]?.tier).toBe("managed");
    await dbs.owner.db.update(businesses).set({ signupChoice: "listing_only" }).where(eq(businesses.id, businessId));
    expect((await listClients(dbs.staff.db))[0]?.tier).toBe("managed");
    expect((await findClientDetail(dbs.staff.db, businessId))?.tier).toBe("managed");
  });
});

describe("listClients", () => {
  it("returns each business with its owner, currency and current project", async () => {
    const clients = await listClients(dbs.staff.db);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      businessId,
      businessName: "Harbour Bakery",
      currency: "INR",
      owner: { name: "Riley Owner", email: "riley@example.com", phone: null },
      project: { id: projectId, status: "onboarding", onboardingSubmittedAt: null },
    });
  });

  it("gives an owner who signs in with a mobile number their number, and no address to write to", async () => {
    await dbs.staff.db.insert(users).values({
      id: "phone-owner",
      name: "Meera Shah",
      email: phoneAccountEmail("+919820011223"),
      phoneNumber: "+919820011223",
      phoneNumberVerified: true,
    });
    const [member] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "smile-dental", name: "Smile Dental", currency: "INR", signupChoice: "managed" })
      .returning({ id: businesses.id });
    if (member === undefined) throw new Error("Seed business was not inserted");
    await dbs.staff.db.insert(businessMembers).values({ businessId: member.id, userId: "phone-owner", role: "owner" });
    await recordPayment(member.id);

    const clients = await listClients(dbs.staff.db);
    expect(clients.find((client) => client.businessId === member.id)?.owner).toEqual({
      name: "Meera Shah",
      email: null,
      phone: "+919820011223",
    });
  });

  it("lists a business with no owner or project rather than dropping it", async () => {
    const [shop] = await dbs.staff.db.insert(businesses).values({ slug: "empty-shop", name: "Empty Shop" }).returning({ id: businesses.id });
    if (shop === undefined) throw new Error("Seed business was not inserted");
    await recordPayment(shop.id);
    const clients = await listClients(dbs.staff.db);
    expect(clients.find((client) => client.businessName === "Empty Shop")).toMatchObject({ owner: null, project: null });
  });

  describe("who counts as a client", () => {
    async function website(slug: string, name: string): Promise<string> {
      const [row] = await dbs.staff.db.insert(businesses).values({ slug, name, kind: "website" }).returning({ id: businesses.id });
      if (row === undefined) throw new Error("Seed business was not inserted");
      return row.id;
    }

    it("leaves out a business that has registered but not paid", async () => {
      await website("unpaid-cafe", "Unpaid Cafe");
      const names = (await listClients(dbs.staff.db)).map((client) => client.businessName);
      expect(names).toEqual(["Harbour Bakery"]);
    });

    it("lists it from the moment its first plan payment is captured", async () => {
      const id = await website("new-cafe", "New Cafe");
      expect((await listClients(dbs.staff.db)).map((client) => client.businessName)).not.toContain("New Cafe");
      await recordPayment(id);
      expect((await listClients(dbs.staff.db)).map((client) => client.businessName)).toContain("New Cafe");
    });

    it("does not count a failed payment, an add-on or a one-off charge as paying for the plan", async () => {
      await recordPayment(await website("failed-cafe", "Failed Cafe"), "initial", "failed");
      await recordPayment(await website("addon-cafe", "Addon Cafe"), "add_on");
      await recordPayment(await website("charge-cafe", "Charge Cafe"), "charge");
      const names = (await listClients(dbs.staff.db)).map((client) => client.businessName);
      expect(names).toEqual(["Harbour Bakery"]);
    });

    it("still opens an unpaid business's page by its address, so a link from the Leads screen keeps working", async () => {
      const id = await website("linked-cafe", "Linked Cafe");
      expect((await findClientDetail(dbs.staff.db, id))?.businessName).toBe("Linked Cafe");
    });
  });

  it("shows the newest project once an older one has finished", async () => {
    await dbs.staff.db.update(projects).set({ status: "cancelled" }).where(eq(projects.id, projectId));
    const [redesign] = await dbs.staff.db
      .insert(projects)
      .values({ businessId, kind: "redesign" })
      .returning({ id: projects.id });
    const clients = await listClients(dbs.staff.db);
    expect(clients[0]?.project?.id).toBe(redesign?.id);
  });
});

describe("findClientDetail", () => {
  it("returns everything the customer sent, in the order they gave it", async () => {
    const mediaId = newMediaAssetId();
    await asOwner(async (tx) => {
      await saveBusinessProfile(tx, {
        displayName: "Harbour Bakery",
        tagline: "Bread before sunrise",
        description: null,
        phone: "+91 98765 43210",
        email: null,
        addressLine1: null,
        addressLine2: null,
        city: "Kochi",
        region: null,
        postalCode: null,
        country: "India",
        serviceAreas: null,
        googleBusinessUrl: null,
      });
      await replaceBusinessHours(tx, [
        { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
        { dayOfWeek: 0, opensAt: "07:00", closesAt: "19:00", closed: false, openAllDay: false },
      ]);
      await replaceServices(tx, [
        { name: "Sourdough", summary: "Baked daily.", priceText: "₹180" },
        { name: "Birthday cakes", summary: null, priceText: null },
      ]);
      await saveProjectBrief(tx, projectId, {
        notesForBuilder: "Show the ovens.",
        styleLikes: null,
        referenceUrls: ["https://example.com/bakery"],
      });
      await savePrimaryDomain(tx, { hostname: "harbourbakery.in", ownerConfirmedAt: SUBMITTED_AT });
      await insertMediaAsset(tx, {
        id: mediaId,
        purpose: "photo",
        storageKey: `t/${businessId}/${mediaId}/display`,
        originalFilename: "IMG_0001.jpg",
        mimeType: "image/webp",
        bytes: 1234,
        width: 800,
        height: 600,
        sha256: "a".repeat(64),
        altText: "Loaves cooling on a rack",
        uploadedByUserId: OWNER,
      });
      await markStepComplete(tx, projectId, "business");
      await markStepComplete(tx, projectId, "content");
      await submitProject(tx, { projectId, now: SUBMITTED_AT });
    });

    const detail = await findClientDetail(dbs.staff.db, businessId);
    expect(detail).toMatchObject({
      businessName: "Harbour Bakery",
      owner: { email: "riley@example.com" },
      project: { status: "submitted", onboardingSubmittedAt: SUBMITTED_AT },
      profile: { tagline: "Bread before sunrise", phone: "+91 98765 43210", city: "Kochi" },
      services: [{ name: "Sourdough", priceText: "₹180" }, { name: "Birthday cakes" }],
      brief: { notesForBuilder: "Show the ovens.", referenceUrls: ["https://example.com/bakery"] },
      domain: { hostname: "harbourbakery.in", ownerConfirmedAt: SUBMITTED_AT },
      media: [{ id: mediaId, purpose: "photo", altText: "Loaves cooling on a rack" }],
    });
    expect(detail?.hours.map((day) => day.dayOfWeek)).toEqual([0, 6]);
    expect([...(detail?.completedSteps ?? [])].sort()).toEqual(["business", "content"]);
  });

  it("leaves out removed services and deleted photos", async () => {
    const mediaId = newMediaAssetId();
    await asOwner(async (tx) => {
      await replaceServices(tx, [{ name: "Old service", summary: null, priceText: null }]);
      await replaceServices(tx, [{ name: "New service", summary: null, priceText: null }]);
      await insertMediaAsset(tx, {
        id: mediaId,
        purpose: "logo",
        storageKey: `t/${businessId}/${mediaId}/display`,
        originalFilename: "logo.png",
        mimeType: "image/webp",
        bytes: 10,
        width: 10,
        height: 10,
        sha256: "b".repeat(64),
        altText: null,
        uploadedByUserId: OWNER,
      });
      await softDeleteMediaAsset(tx, mediaId);
    });

    const detail = await findClientDetail(dbs.staff.db, businessId);
    expect(detail?.services.map((service) => service.name)).toEqual(["New service"]);
    expect(detail?.media).toEqual([]);
  });

  it("returns empty sections for a customer who hasn't started", async () => {
    expect(await findClientDetail(dbs.staff.db, businessId)).toMatchObject({
      profile: null,
      hours: [],
      services: [],
      brief: null,
      domain: null,
      media: [],
      completedSteps: [],
    });
  });

  it("returns null for an unknown or malformed id instead of throwing", async () => {
    expect(await findClientDetail(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
    expect(await findClientDetail(dbs.staff.db, "not-a-uuid")).toBeNull();
    expect(await findClientDetail(dbs.staff.db, "'; drop table businesses; --")).toBeNull();
  });
});

describe("findMediaForStaff", () => {
  it("finds a ready photo and nothing else", async () => {
    const mediaId = newMediaAssetId();
    await asOwner((tx) =>
      insertMediaAsset(tx, {
        id: mediaId,
        purpose: "photo",
        storageKey: `t/${businessId}/${mediaId}/display`,
        originalFilename: "IMG_0002.jpg",
        mimeType: "image/webp",
        bytes: 99,
        width: 1,
        height: 1,
        sha256: "c".repeat(64),
        altText: "A loaf",
        uploadedByUserId: OWNER,
      }),
    );

    expect(await findMediaForStaff(dbs.staff.db, mediaId)).toEqual({
      storageKey: `t/${businessId}/${mediaId}/display`,
      mimeType: "image/webp",
      sha256: "c".repeat(64),
    });
    expect(await findMediaForStaff(dbs.staff.db, "not-a-uuid")).toBeNull();

    await asOwner((tx) => softDeleteMediaAsset(tx, mediaId));
    expect(await findMediaForStaff(dbs.staff.db, mediaId)).toBeNull();
  });
});

describe("listClients include (contract C3b)", () => {
  it("lists paying businesses by default and any mix of paying, not paid and leaving when asked", async () => {
    const [unpaid] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "not-paid-yet", name: "Not Paid Yet", currency: "INR" })
      .returning({ id: businesses.id });
    if (unpaid === undefined) throw new Error("Seed business was not inserted");
    const names = async (include?: readonly ("paying" | "not_paid" | "leaving")[]): Promise<string[]> =>
      (await listClients(dbs.staff.db, include === undefined ? undefined : { include })).map((client) => client.businessName);

    expect(await names()).toEqual(["Harbour Bakery"]);
    expect(await listClients(dbs.staff.db, {})).toEqual(await listClients(dbs.staff.db));
    expect(await names(["not_paid"])).toEqual(["Not Paid Yet"]);
    expect(await names(["paying", "not_paid"])).toEqual(["Not Paid Yet", "Harbour Bakery"]);
    expect(await names(["leaving"])).toEqual([]);
    expect(await names([])).toEqual([]);

    const notPaid = (await listClients(dbs.staff.db, { include: ["not_paid"] }))[0];
    expect(notPaid?.billing.firstPayment).toBeNull();

    await openAccountClosure(dbs.staff.db, {
      userId: OWNER,
      businessId,
      now: new Date("2026-10-01T09:00:00.000Z"),
      eraseAfter: new Date("2026-10-31T09:00:00.000Z"),
    });
    expect(await names(["leaving"])).toEqual(["Harbour Bakery"]);
    expect(await names(["not_paid", "leaving"])).toEqual(["Not Paid Yet", "Harbour Bakery"]);
    // A leaving business that paid is still paying: the default list does not change.
    expect(await names()).toEqual(["Harbour Bakery"]);
  });
});

describe("a business's members", () => {
  it("lists the owner and editors, oldest first, hiding a phone account's placeholder email", async () => {
    await dbs.staff.db.insert(users).values({ id: "editor-1", name: "Sam Editor", email: phoneAccountEmail("+919820012345"), phoneNumber: "+919820012345" });
    await dbs.staff.db.insert(businessMembers).values({ businessId, userId: "editor-1", role: "editor" });

    const members = await listBusinessMembersForStaff(dbs.staff.db, businessId);
    expect(members.map((member) => [member.userId, member.role, member.email, member.phone])).toEqual([
      [OWNER, "owner", "riley@example.com", null],
      ["editor-1", "editor", null, "+919820012345"],
    ]);
    expect(await listBusinessMembersForStaff(dbs.staff.db, "not-a-uuid")).toEqual([]);
  });

  it("renames the owner of this business only", async () => {
    expect(await renameBusinessOwner(dbs.staff.db, { businessId, userId: OWNER, name: "Riley Fernandes" })).toBe(true);
    expect((await findClientDetail(dbs.staff.db, businessId))?.owner?.name).toBe("Riley Fernandes");

    await dbs.staff.db.insert(users).values({ id: "editor-2", name: "Kim Editor", email: "kim@example.com" });
    await dbs.staff.db.insert(businessMembers).values({ businessId, userId: "editor-2", role: "editor" });
    expect(await renameBusinessOwner(dbs.staff.db, { businessId, userId: "editor-2", name: "Not The Owner" })).toBe(false);
    expect(await renameBusinessOwner(dbs.staff.db, { businessId: "not-a-uuid", userId: OWNER, name: "X" })).toBe(false);
  });
});

