import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSetupInvite } from "./queries/invites";
import { createLead } from "./queries/leads";
import {
  findMediaAsset,
  insertMediaAsset,
  listMediaAssets,
  newMediaAssetId,
  PhotoLimitReachedError,
  recordUploadedMedia,
  softDeleteMediaAsset,
  updateMediaAltText,
  type NewMediaAsset,
} from "./queries/media";
import { attachAccountToNewBusiness, redeemInviteIntoBusiness } from "./queries/onboarding";
import {
  DomainTakenError,
  DuplicateServiceIdError,
  getBusinessHours,
  getBusinessProfile,
  getPrimaryDomain,
  getProjectBrief,
  listServices,
  listStepProgress,
  markStepComplete,
  OnboardingLockedError,
  replaceBusinessHours,
  replaceServices,
  saveBusinessProfile,
  savePrimaryDomain,
  saveProjectBrief,
  ServiceNotFoundError,
  type BusinessProfileInput,
} from "./queries/onboarding-data";
import { findLatestProject, findOpenProject, ProjectNotInOnboardingError, submitProject } from "./queries/projects";
import { TenantScopeMissingError } from "./queries/tenant";
import {
  businesses,
  businessHours,
  businessMembers,
  businessProfiles,
  domains,
  mediaAssets,
  onboardingProgress,
  projectBriefs,
  projects,
  services,
  staffMembers,
  users,
} from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";
const STAFF_USER = "staff-1";
const SUBMITTED_AT = new Date("2026-09-16T09:30:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let projectA = "";
let projectB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

/** Runs `work` exactly as a customer request would: the app connection, scoped to one user and their business. */
function asTenant<T>(tenant: "A" | "B", work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  const scope = tenant === "A" ? { userId: USER_A, businessId: businessA } : { userId: USER_B, businessId: businessB };
  return withTenantScope(dbs.app.db, scope, work);
}

function profileInput(displayName: string): BusinessProfileInput {
  return {
    displayName,
    tagline: "Fast, tidy repairs",
    description: "Family plumbers since 1998.",
    phone: "+1 555 0100",
    email: "hello@riverside.example",
    addressLine1: "1 River Road",
    addressLine2: null,
    city: "Springfield",
    region: "IL",
    postalCode: "62701",
    country: "US",
    serviceAreas: "Springfield and nearby",
    googleBusinessUrl: "https://g.page/riverside",
  };
}

function mediaInput(uploadedByUserId: string, businessId: string): NewMediaAsset {
  const id = newMediaAssetId();
  return {
    id,
    purpose: "photo",
    storageKey: `t/${businessId}/${id}/display`,
    originalFilename: "IMG_0001.jpg",
    mimeType: "image/webp",
    bytes: 1234,
    width: 800,
    height: 600,
    sha256: "a".repeat(64),
    altText: "The van outside a customer's house",
    uploadedByUserId,
  };
}

/** Saves one of everything for a tenant, as the five onboarding steps would. Returns the media id. */
async function fillEveryStep(tenant: "A" | "B"): Promise<string> {
  const userId = tenant === "A" ? USER_A : USER_B;
  const businessId = tenant === "A" ? businessA : businessB;
  const projectId = tenant === "A" ? projectA : projectB;
  return asTenant(tenant, async (tx) => {
    await saveBusinessProfile(tx, profileInput(`Business ${tenant}`));
    await replaceBusinessHours(tx, [
      { dayOfWeek: 0, opensAt: "09:00", closesAt: "12:00", closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: "13:00", closesAt: "17:30", closed: false, openAllDay: false },
      { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
    ]);
    await replaceServices(tx, [
      { name: "Leak repair", summary: "Same-day fixes.", priceText: "From $40" },
      { name: "Boiler service", summary: null, priceText: "Call for a quote" },
    ]);
    await saveProjectBrief(tx, projectId, {
      notesForBuilder: "Show the van.",
      styleLikes: "Calm and clean",
      referenceUrls: ["https://example.com/a"],
    });
    await savePrimaryDomain(tx, { hostname: `${tenant.toLowerCase()}-plumbing.example`, ownerConfirmedAt: SUBMITTED_AT });
    const media = await insertMediaAsset(tx, mediaInput(userId, businessId));
    await markStepComplete(tx, projectId, "business");
    return media.id;
  });
}

/** Every tenant table, read in full through the staff connection, so a test can prove nothing changed. */
async function snapshotTenantTables(): Promise<unknown> {
  const db = dbs.staff.db;
  return {
    projects: await db.select().from(projects).orderBy(asc(projects.id)),
    progress: await db.select().from(onboardingProgress).orderBy(asc(onboardingProgress.projectId), asc(onboardingProgress.step)),
    profiles: await db.select().from(businessProfiles).orderBy(asc(businessProfiles.businessId)),
    hours: await db.select().from(businessHours).orderBy(asc(businessHours.id)),
    services: await db.select().from(services).orderBy(asc(services.id)),
    briefs: await db.select().from(projectBriefs).orderBy(asc(projectBriefs.projectId)),
    domains: await db.select().from(domains).orderBy(asc(domains.id)),
    media: await db.select().from(mediaAssets).orderBy(asc(mediaAssets.id)),
  };
}

async function seedStaffAndLead(): Promise<string> {
  await dbs.staff.db.insert(users).values({ id: STAFF_USER, name: "Sam Staff", email: "sam@firstfold.test" });
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF_USER });
  const lead = await createLead(dbs.staff.db, {
    name: "Riley Owner",
    businessName: "Harbour Bakery",
    email: "riley@example.com",
    phone: "+1 555 0101",
    businessType: "food",
    currency: "USD",
    message: null,
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
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing" },
      { slug: "chennai-cafe", name: "Chennai Cafe" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-plumbing");
  businessB = idForSlug(inserted, "chennai-cafe");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
  const opened = await dbs.staff.db
    .insert(projects)
    .values([{ businessId: businessA }, { businessId: businessB }])
    .returning({ id: projects.id, businessId: projects.businessId });
  projectA = opened.find((row) => row.businessId === businessA)?.id ?? "";
  projectB = opened.find((row) => row.businessId === businessB)?.id ?? "";
});

describe("account creation opens the onboarding project", () => {
  it("gives a redeemed invite exactly one onboarding project", async () => {
    const leadId = await seedStaffAndLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "riley@example.com",
      businessName: "Harbour Bakery",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "riley@example.com" });

    const { businessId } = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Harbour Bakery",
      userId: "customer-1",
    });

    const rows = await dbs.staff.db
      .select({ status: projects.status, kind: projects.kind, slaDueAt: projects.slaDueAt })
      .from(projects)
      .where(eq(projects.businessId, businessId));
    expect(rows).toEqual([{ status: "onboarding", kind: "initial_build", slaDueAt: null }]);

    const seen = await withTenantScope(dbs.app.db, { userId: "customer-1", businessId }, findOpenProject);
    expect(seen).toMatchObject({ businessId, status: "onboarding" });
  });

  it("gives an account attached by staff exactly one onboarding project", async () => {
    const leadId = await seedStaffAndLead();
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "riley@example.com" });

    const { businessId } = await attachAccountToNewBusiness(dbs.staff.db, { leadId, attachedByStaffId: STAFF_USER });

    const rows = await dbs.staff.db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.businessId, businessId));
    expect(rows).toEqual([{ status: "onboarding" }]);
  });
});

describe("saving and reading every step", () => {
  it("reads back what the tenant saved", async () => {
    const mediaId = await fillEveryStep("A");

    await asTenant("A", async (tx) => {
      expect(await getBusinessProfile(tx)).toMatchObject({ ...profileInput("Business A"), businessId: businessA });
      expect(await getBusinessHours(tx)).toMatchObject([
        { dayOfWeek: 0, opensAt: "09:00:00", closesAt: "12:00:00", closed: false, openAllDay: false },
        { dayOfWeek: 0, opensAt: "13:00:00", closesAt: "17:30:00", closed: false, openAllDay: false },
        { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
      ]);
      expect(await listServices(tx)).toMatchObject([
        { name: "Leak repair", summary: "Same-day fixes.", priceText: "From $40", position: 0 },
        { name: "Boiler service", summary: null, priceText: "Call for a quote", position: 1 },
      ]);
      expect(await getProjectBrief(tx, projectA)).toMatchObject({
        projectId: projectA,
        notesForBuilder: "Show the van.",
        styleLikes: "Calm and clean",
        referenceUrls: ["https://example.com/a"],
      });
      expect(await getPrimaryDomain(tx)).toMatchObject({
        hostname: "a-plumbing.example",
        status: "pending",
        ownerConfirmedAt: SUBMITTED_AT,
      });
      expect(await findMediaAsset(tx, mediaId)).toMatchObject({ id: mediaId, businessId: businessA, status: "ready" });
      expect((await listMediaAssets(tx, "photo")).map((asset) => asset.id)).toEqual([mediaId]);
      expect(await listMediaAssets(tx, "logo")).toEqual([]);
      expect(await listStepProgress(tx, projectA)).toMatchObject([{ step: "business" }]);
    });
  });

  it("upserts the profile and brief instead of adding rows", async () => {
    await asTenant("A", async (tx) => {
      await saveBusinessProfile(tx, profileInput("First name"));
      await saveBusinessProfile(tx, { ...profileInput("Second name"), tagline: null });
      await saveProjectBrief(tx, projectA, { notesForBuilder: "one", styleLikes: null, referenceUrls: [] });
      await saveProjectBrief(tx, projectA, { notesForBuilder: "two", styleLikes: null, referenceUrls: [] });
      await markStepComplete(tx, projectA, "content");
      await markStepComplete(tx, projectA, "content");
    });

    expect(await dbs.staff.db.select({ name: businessProfiles.displayName, tagline: businessProfiles.tagline }).from(businessProfiles)).toEqual([
      { name: "Second name", tagline: null },
    ]);
    expect(await dbs.staff.db.select({ notes: projectBriefs.notesForBuilder }).from(projectBriefs)).toEqual([
      { notes: "two" },
    ]);
    expect(await dbs.staff.db.select({ step: onboardingProgress.step }).from(onboardingProgress)).toEqual([
      { step: "content" },
    ]);
  });

  it("replaces hours as a set, and keeps the old set when a new row is invalid", async () => {
    await asTenant("A", (tx) =>
      replaceBusinessHours(tx, [{ dayOfWeek: 1, opensAt: "08:00", closesAt: "16:00", closed: false, openAllDay: false }]),
    );
    await asTenant("A", (tx) =>
      replaceBusinessHours(tx, [{ dayOfWeek: 2, opensAt: "10:00", closesAt: "14:00", closed: false, openAllDay: false }]),
    );
    expect(await asTenant("A", getBusinessHours)).toMatchObject([{ dayOfWeek: 2 }]);

    await expect(
      asTenant("A", (tx) =>
        replaceBusinessHours(tx, [{ dayOfWeek: 3, opensAt: "09:00", closesAt: "09:00", closed: false, openAllDay: false }]),
      ),
    ).rejects.toThrow();
    expect(await asTenant("A", getBusinessHours)).toMatchObject([{ dayOfWeek: 2 }]);
  });

  it("keeps, updates, soft-deletes and reorders services", async () => {
    const first = await asTenant("A", (tx) =>
      replaceServices(tx, [
        { name: "One", summary: null, priceText: null },
        { name: "Two", summary: null, priceText: null },
        { name: "Three", summary: null, priceText: null },
      ]),
    );
    const [one, two, three] = first;
    if (one === undefined || two === undefined || three === undefined) throw new Error("Services were not saved");

    const second = await asTenant("A", (tx) =>
      replaceServices(tx, [
        { id: three.id, name: "Three, renamed", summary: "Now first", priceText: null },
        { name: "Four", summary: null, priceText: "£10" },
        { id: one.id, name: "One", summary: null, priceText: null },
      ]),
    );

    expect(second.map((service) => [service.name, service.position])).toEqual([
      ["Three, renamed", 0],
      ["Four", 1],
      ["One", 2],
    ]);
    expect(second[0]?.id).toBe(three.id);
    expect(second[2]?.id).toBe(one.id);
    const removed = await dbs.staff.db
      .select({ deletedAt: services.deletedAt })
      .from(services)
      .where(eq(services.id, two.id));
    expect(removed[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("refuses a service id that is removed, unknown, repeated or another tenant's", async () => {
    const [serviceB] = await asTenant("B", (tx) => replaceServices(tx, [{ name: "B", summary: null, priceText: null }]));
    const [serviceA] = await asTenant("A", (tx) => replaceServices(tx, [{ name: "A", summary: null, priceText: null }]));
    if (serviceA === undefined || serviceB === undefined) throw new Error("Services were not saved");
    await asTenant("A", (tx) => replaceServices(tx, []));

    const attempts = [
      { id: serviceB.id, error: ServiceNotFoundError },
      { id: serviceA.id, error: ServiceNotFoundError },
      { id: "0192f3c4-0000-7000-8000-00000000dead", error: ServiceNotFoundError },
    ];
    for (const attempt of attempts) {
      await expect(
        asTenant("A", (tx) => replaceServices(tx, [{ id: attempt.id, name: "Stolen", summary: null, priceText: null }])),
      ).rejects.toBeInstanceOf(attempt.error);
    }

    const [kept] = await asTenant("A", (tx) => replaceServices(tx, [{ name: "Kept", summary: null, priceText: null }]));
    if (kept === undefined) throw new Error("Service was not saved");
    await expect(
      asTenant("A", (tx) =>
        replaceServices(tx, [
          { id: kept.id, name: "Kept", summary: null, priceText: null },
          { id: kept.id, name: "Kept again", summary: null, priceText: null },
        ]),
      ),
    ).rejects.toBeInstanceOf(DuplicateServiceIdError);

    const namesB = await asTenant("B", listServices);
    expect(namesB.map((service) => service.name)).toEqual(["B"]);
  });

  it("changes the primary domain by retiring the old row, and updates confirmation in place", async () => {
    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "  Old.Example ", ownerConfirmedAt: null }));
    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "old.example", ownerConfirmedAt: SUBMITTED_AT }));
    expect(await dbs.staff.db.select({ id: domains.id }).from(domains)).toHaveLength(1);
    expect(await asTenant("A", getPrimaryDomain)).toMatchObject({ hostname: "old.example", ownerConfirmedAt: SUBMITTED_AT });

    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "new.example", ownerConfirmedAt: SUBMITTED_AT }));
    expect(await asTenant("A", getPrimaryDomain)).toMatchObject({ hostname: "new.example" });
    const rows = await dbs.staff.db
      .select({ hostname: domains.hostname, removedAt: domains.removedAt })
      .from(domains)
      .orderBy(asc(domains.createdAt), asc(domains.id));
    expect(rows.map((row) => [row.hostname, row.removedAt === null])).toEqual([
      ["old.example", false],
      ["new.example", true],
    ]);
  });

  it("soft-deletes media and edits its description", async () => {
    const media = await asTenant("A", (tx) => insertMediaAsset(tx, mediaInput(USER_A, businessA)));

    expect(await asTenant("A", (tx) => updateMediaAltText(tx, media.id, "A new description"))).toBe(true);
    expect(await asTenant("A", (tx) => findMediaAsset(tx, media.id))).toMatchObject({ altText: "A new description" });

    expect(await asTenant("A", (tx) => softDeleteMediaAsset(tx, media.id))).toBe(media.storageKey);
    expect(await asTenant("A", (tx) => findMediaAsset(tx, media.id))).toBeNull();
    expect(await asTenant("A", (tx) => softDeleteMediaAsset(tx, media.id))).toBeNull();
    expect(await dbs.staff.db.select({ id: mediaAssets.id }).from(mediaAssets)).toHaveLength(1);
  });
});

describe("recording uploads", () => {
  const LIMITS = { maxPhotos: 20 };

  async function livePhotoCount(): Promise<number> {
    return (await asTenant("A", (tx) => listMediaAssets(tx, "photo"))).length;
  }

  it("keeps a business to its photo limit when two uploads race at 19 photos", async () => {
    for (let index = 0; index < 19; index += 1) {
      await asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS));
    }
    expect(await livePhotoCount()).toBe(19);

    // The first upload has counted and inserted but not committed. Without the lock the second would count 19 too,
    // since it cannot see the first's row, and a 21st photo would be stored.
    let releaseFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let signalRecorded: () => void = () => undefined;
    const recorded = new Promise<void>((resolve) => {
      signalRecorded = resolve;
    });
    const first = asTenant("A", async (tx) => {
      const result = await recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS);
      signalRecorded();
      await firstHeld;
      return result;
    });
    await recorded;
    const second = asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS));
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      releaseFirst();
    }
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe("fulfilled");
    expect(secondResult.status).toBe("rejected");
    expect(secondResult.status === "rejected" ? secondResult.reason : null).toBeInstanceOf(PhotoLimitReachedError);
    expect(await livePhotoCount()).toBe(20);
  });

  it("settles two uploads started together at 19 photos with exactly 20", async () => {
    for (let index = 0; index < 19; index += 1) {
      await asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS));
    }
    const results = await Promise.allSettled([
      asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS)),
      asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await livePhotoCount()).toBe(20);
  });

  it("leaves one logo when two replace it at once, and hands back the replaced files", async () => {
    const logo = (): NewMediaAsset => ({ ...mediaInput(USER_A, businessA), purpose: "logo" });
    const original = await asTenant("A", (tx) => recordUploadedMedia(tx, logo(), LIMITS));

    const [a, b] = await Promise.all([
      asTenant("A", (tx) => recordUploadedMedia(tx, logo(), LIMITS)),
      asTenant("A", (tx) => recordUploadedMedia(tx, logo(), LIMITS)),
    ]);

    const live = await asTenant("A", (tx) => listMediaAssets(tx, "logo"));
    expect(live).toHaveLength(1);
    // Whichever ran second replaced the first, which had replaced the original.
    const replaced = [...a.replacedStorageKeys, ...b.replacedStorageKeys].sort();
    const expected = [original.asset.storageKey, live[0]?.id === a.asset.id ? b.asset.storageKey : a.asset.storageKey].sort();
    expect(replaced).toEqual(expected);
  });

  it("refuses to record anything once onboarding is sent", async () => {
    await asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }));
    await expect(
      asTenant("A", (tx) => recordUploadedMedia(tx, mediaInput(USER_A, businessA), LIMITS)),
    ).rejects.toBeInstanceOf(OnboardingLockedError);
  });
});

describe("tenant isolation", () => {
  it("shows one business nothing of another's through the query functions", async () => {
    const mediaA = await fillEveryStep("A");

    await asTenant("B", async (tx) => {
      expect(await getBusinessProfile(tx)).toBeNull();
      expect(await getBusinessHours(tx)).toEqual([]);
      expect(await listServices(tx)).toEqual([]);
      expect(await getProjectBrief(tx, projectA)).toBeNull();
      expect(await getPrimaryDomain(tx)).toBeNull();
      expect(await findMediaAsset(tx, mediaA)).toBeNull();
      expect(await listMediaAssets(tx, "photo")).toEqual([]);
      expect(await listStepProgress(tx, projectA)).toEqual([]);
      expect(await findOpenProject(tx)).toMatchObject({ id: projectB });
      // Another tenant's project cannot be written to through any function that takes a project id.
      await expect(saveProjectBrief(tx, projectA, { notesForBuilder: "x", styleLikes: null, referenceUrls: [] })).rejects.toBeInstanceOf(
        OnboardingLockedError,
      );
    });
    await expect(asTenant("B", (tx) => markStepComplete(tx, projectA, "domain"))).rejects.toBeInstanceOf(
      OnboardingLockedError,
    );
    await expect(asTenant("B", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }))).rejects.toBeInstanceOf(
      ProjectNotInOnboardingError,
    );
  });

  // Straight SQL through the app connection, bypassing the query layer, so row-level security is what is tested.
  // Each table lists the statement a tenant would use to plant a row under another business's id.
  // `updateSet` is a harmless update of a column the app role may write, or null when it may update nothing;
  // `canMoveRows` says whether it may write business_id at all, in which case row-level security must refuse it.
  const TABLES: readonly {
    readonly table: string;
    readonly updateSet: string | null;
    readonly canDelete: boolean;
    readonly canMoveRows: boolean;
    readonly insertForeign: () => SQL;
  }[] = [
    {
      table: "projects",
      updateSet: "status = status",
      canDelete: false,
      canMoveRows: false,
      insertForeign: () => sql`insert into projects (id, business_id) values (gen_random_uuid(), ${businessA})`,
    },
    {
      table: "onboarding_progress",
      updateSet: "completed_at = completed_at",
      canDelete: false,
      canMoveRows: true,
      insertForeign: () =>
        sql`insert into onboarding_progress (project_id, business_id, step) values (${projectA}, ${businessA}, 'review')`,
    },
    {
      table: "business_profiles",
      updateSet: "display_name = display_name",
      canDelete: false,
      canMoveRows: true,
      insertForeign: () => sql`insert into business_profiles (business_id, display_name) values (${businessA}, 'Planted')`,
    },
    {
      table: "business_hours",
      updateSet: null,
      canDelete: true,
      canMoveRows: false,
      insertForeign: () =>
        sql`insert into business_hours (id, business_id, day_of_week, closed) values (gen_random_uuid(), ${businessA}, 3, true)`,
    },
    {
      table: "services",
      updateSet: "name = name",
      canDelete: false,
      canMoveRows: true,
      insertForeign: () =>
        sql`insert into services (id, business_id, name, position) values (gen_random_uuid(), ${businessA}, 'Planted', 9)`,
    },
    {
      table: "project_briefs",
      updateSet: "style_likes = style_likes",
      canDelete: false,
      canMoveRows: true,
      insertForeign: () => sql`insert into project_briefs (project_id, business_id) values (${projectA}, ${businessA})`,
    },
    {
      table: "domains",
      updateSet: "owner_confirmed_at = owner_confirmed_at",
      canDelete: false,
      canMoveRows: false,
      insertForeign: () =>
        sql`insert into domains (id, business_id, hostname, is_primary) values (gen_random_uuid(), ${businessA}, 'planted.example', false)`,
    },
    {
      table: "media_assets",
      updateSet: "alt_text = alt_text",
      canDelete: false,
      canMoveRows: false,
      insertForeign: () => {
        // A well-formed key, so the refusal below can only come from row-level security.
        const id = newMediaAssetId();
        return sql`insert into media_assets (id, business_id, purpose, storage_key, original_filename, mime_type, bytes, width, height, sha256, status, uploaded_by_user_id)
            values (${id}, ${businessA}, 'logo', ${`t/${businessA}/${id}/display`}, 'f', 'image/webp', 1, 1, 1, 'x', 'ready', ${USER_B})`;
      },
    },
  ];

  for (const { table, updateSet, canDelete, canMoveRows, insertForeign } of TABLES) {
    it(`keeps ${table} to its own business for reads and writes`, async () => {
      await fillEveryStep("A");
      await fillEveryStep("B");
      const before = await snapshotTenantTables();
      const name = sql.raw(table);

      const readA = await asTenant("A", (tx) =>
        tx.execute<{ business_id: string }>(sql`select business_id::text from ${name}`),
      );
      expect(readA.rows.length).toBeGreaterThan(0);
      expect(new Set(readA.rows.map((row) => row.business_id))).toEqual(new Set([businessA]));

      const peek = await asTenant("B", (tx) =>
        tx.execute(sql`select 1 from ${name} where business_id = ${businessA}`),
      );
      expect(peek.rows).toEqual([]);

      const updateAttempt = asTenant("B", (tx) =>
        tx.execute(sql`update ${name} set ${sql.raw(updateSet ?? "business_id = business_id")} where business_id = ${businessA}`),
      );
      if (updateSet === null) {
        expect(await captureErrorText(updateAttempt)).toMatch(new RegExp(`permission denied for table ${table}`));
      } else {
        expect((await updateAttempt).rowCount).toBe(0);
      }

      const deleteAttempt = asTenant("B", (tx) => tx.execute(sql`delete from ${name} where business_id = ${businessA}`));
      if (canDelete) {
        expect((await deleteAttempt).rowCount).toBe(0);
      } else {
        expect(await captureErrorText(deleteAttempt)).toMatch(new RegExp(`permission denied for table ${table}`));
      }

      const insertError = await captureErrorText(asTenant("B", (tx) => tx.execute(insertForeign())));
      expect(insertError).toMatch(
        table === "projects"
          ? /permission denied for table projects/
          : new RegExp(`new row violates row-level security policy for table "${table}"`),
      );

      // Moving one of your own rows over to another business is refused too.
      const moveError = await captureErrorText(
        asTenant("B", (tx) => tx.execute(sql`update ${name} set business_id = ${businessA}`)),
      );
      expect(moveError).toMatch(
        canMoveRows
          ? new RegExp(`new row violates row-level security policy for table "${table}"`)
          : new RegExp(`permission denied for table ${table}`),
      );

      expect(await snapshotTenantTables()).toEqual(before);
    });
  }

  it("sees and writes nothing when the transaction has no tenant scope", async () => {
    await fillEveryStep("A");

    const unscoped = await dbs.app.db.transaction((tx) => tx.execute(sql`select 1 from business_profiles`));
    expect(unscoped.rows).toEqual([]);
    await expect(dbs.app.db.transaction((tx) => getBusinessProfile(tx))).rejects.toBeInstanceOf(TenantScopeMissingError);
    await expect(dbs.app.db.transaction((tx) => saveBusinessProfile(tx, profileInput("Nobody")))).rejects.toBeInstanceOf(
      TenantScopeMissingError,
    );
  });

  it("stops a tenant pointing a progress row or brief at another tenant's project", async () => {
    // Foreign key checks bypass row-level security, so only the composite key stops this.
    for (const statement of [
      sql`insert into onboarding_progress (project_id, business_id, step) values (${projectA}, ${businessB}, 'review')`,
      sql`insert into project_briefs (project_id, business_id) values (${projectA}, ${businessB})`,
    ]) {
      const message = await captureErrorText(asTenant("B", (tx) => tx.execute(statement)));
      expect(message).toMatch(/violates foreign key constraint "(onboarding_progress|project_briefs)_project_business_fk"/);
    }
  });
});

describe("the onboarding lock", () => {
  it("refuses every save once the project is submitted, and changes nothing", async () => {
    const mediaId = await fillEveryStep("A");
    const [service] = await asTenant("A", listServices);
    if (service === undefined) throw new Error("Service was not saved");
    await asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }));
    const before = await snapshotTenantTables();

    const saves: readonly [string, (tx: ScopedTransaction) => Promise<unknown>][] = [
      ["saveBusinessProfile", (tx) => saveBusinessProfile(tx, profileInput("Changed"))],
      ["replaceBusinessHours", (tx) => replaceBusinessHours(tx, [])],
      ["replaceServices", (tx) => replaceServices(tx, [{ id: service.id, name: "Changed", summary: null, priceText: null }])],
      [
        "saveProjectBrief",
        (tx) => saveProjectBrief(tx, projectA, { notesForBuilder: "Changed", styleLikes: null, referenceUrls: [] }),
      ],
      ["savePrimaryDomain", (tx) => savePrimaryDomain(tx, { hostname: "changed.example", ownerConfirmedAt: null })],
      ["markStepComplete", (tx) => markStepComplete(tx, projectA, "review")],
      ["insertMediaAsset", (tx) => insertMediaAsset(tx, mediaInput(USER_A, businessA))],
      ["updateMediaAltText", (tx) => updateMediaAltText(tx, mediaId, "Changed")],
      ["softDeleteMediaAsset", (tx) => softDeleteMediaAsset(tx, mediaId)],
    ];
    for (const [name, save] of saves) {
      await expect(asTenant("A", save), name).rejects.toBeInstanceOf(OnboardingLockedError);
    }

    expect(await snapshotTenantTables()).toEqual(before);
    // Reads still work, so the submitted answers can be shown read-only.
    expect(await asTenant("A", getBusinessProfile)).toMatchObject({ displayName: "Business A" });
  });

  it("leaves the other tenant free to keep saving", async () => {
    await asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }));
    await expect(asTenant("B", (tx) => saveBusinessProfile(tx, profileInput("Still open")))).resolves.toMatchObject({
      displayName: "Still open",
    });
  });

  it("makes a submission wait for a save already in progress", async () => {
    const order: string[] = [];
    let releaseSave: () => void = () => undefined;
    const saveHeld = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let signalLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });

    const save = asTenant("A", async (tx) => {
      await saveBusinessProfile(tx, profileInput("Saved before submission"));
      signalLocked();
      await saveHeld;
      order.push("save committed");
    });
    await locked;
    const submit = asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT })).then(() => {
      order.push("submitted");
    });
    try {
      // Give the submission every chance to run ahead if the lock were not there.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(order).toEqual([]);
    } finally {
      // Always let the held transaction finish, or a failure here would leave a connection open and hang teardown.
      releaseSave();
      await Promise.allSettled([save, submit]);
    }
    await Promise.all([save, submit]);

    expect(order).toEqual(["save committed", "submitted"]);
    expect(await asTenant("A", getBusinessProfile)).toMatchObject({ displayName: "Saved before submission" });
  });
});

describe("submitProject", () => {
  it("submits once, starts the 48-hour clock, and refuses a second submission", async () => {
    const submitted = await asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }));
    expect(submitted).toMatchObject({
      id: projectA,
      status: "submitted",
      onboardingSubmittedAt: SUBMITTED_AT,
      slaDueAt: new Date("2026-09-18T09:30:00.000Z"),
    });

    const later = new Date("2026-09-17T09:30:00.000Z");
    await expect(asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: later }))).rejects.toBeInstanceOf(
      ProjectNotInOnboardingError,
    );
    expect(await asTenant("A", findOpenProject)).toMatchObject({
      status: "submitted",
      slaDueAt: new Date("2026-09-18T09:30:00.000Z"),
    });
  });

  it("refuses an id that is not a UUID or not a project", async () => {
    for (const projectId of ["not-a-uuid", "0192f3c4-0000-7000-8000-00000000dead"]) {
      await expect(asTenant("A", (tx) => submitProject(tx, { projectId, now: SUBMITTED_AT }))).rejects.toBeInstanceOf(
        ProjectNotInOnboardingError,
      );
    }
  });
});

describe("findLatestProject", () => {
  it("still sees a project once it has gone live, unlike findOpenProject which stops seeing it", async () => {
    await dbs.staff.db.update(projects).set({ status: "live" }).where(eq(projects.id, projectA));

    // The exact contrast that matters: once a project is live it is no longer "open", so findOpenProject correctly
    // reports nothing left to do in onboarding — but a caller asking "what is this business's current project?"
    // (e.g. to check whether the site is actually live) must not be told there is none.
    expect(await asTenant("A", findOpenProject)).toBeNull();
    expect(await asTenant("A", findLatestProject)).toMatchObject({ id: projectA, status: "live" });
  });

  it("returns the most recently created project when a business has more than one", async () => {
    await dbs.staff.db.update(projects).set({ status: "live" }).where(eq(projects.id, projectA));
    const [redesign] = await dbs.staff.db
      .insert(projects)
      .values({ businessId: businessA, kind: "redesign", status: "onboarding" })
      .returning();

    expect(await asTenant("A", findLatestProject)).toMatchObject({ id: redesign!.id, status: "onboarding" });
  });

  it("returns null for a business with no project at all", async () => {
    await dbs.staff.db.delete(projects).where(eq(projects.id, projectB));
    expect(await asTenant("B", findLatestProject)).toBeNull();
  });
});

describe("what the database itself enforces on projects", () => {
  it("does not let the app role create a project", async () => {
    const message = await captureErrorText(
      asTenant("A", (tx) => tx.insert(projects).values({ businessId: businessA, status: "onboarding" })),
    );
    expect(message).toMatch(/permission denied for table projects/);
  });

  it("holds the app role to onboarding -> submitted, even with a raw UPDATE", async () => {
    // No query function moves a project anywhere else. Row-level security alone would allow any status on the
    // tenant's own row, because a policy cannot compare old and new rows; the projects_guard_customer_transition
    // trigger in 0014 is what refuses these.
    for (const status of ["live", "building", "cancelled", "approved"] as const) {
      const message = await captureErrorText(
        asTenant("A", (tx) => tx.update(projects).set({ status }).where(eq(projects.id, projectA))),
      );
      expect(message, status).toMatch(/(firstfold_app|webfold_app) may only move a project from onboarding to submitted/);
    }

    await asTenant("A", (tx) => submitProject(tx, { projectId: projectA, now: SUBMITTED_AT }));
    const reopen = await captureErrorText(
      asTenant("A", (tx) => tx.update(projects).set({ status: "onboarding" }).where(eq(projects.id, projectA))),
    );
    expect(reopen).toMatch(/(firstfold_app|webfold_app) may only move a project from onboarding to submitted/);
    const resubmit = await captureErrorText(
      asTenant("A", (tx) =>
        tx.update(projects).set({ status: "submitted", slaDueAt: new Date("2030-01-01T00:00:00Z") }).where(eq(projects.id, projectA)),
      ),
    );
    expect(resubmit).toMatch(/(firstfold_app|webfold_app) may only move a project from onboarding to submitted/);

    const stored = await dbs.staff.db.select({ status: projects.status, slaDueAt: projects.slaDueAt }).from(projects).where(eq(projects.id, projectA));
    expect(stored).toEqual([{ status: "submitted", slaDueAt: new Date("2026-09-18T09:30:00.000Z") }]);
  });

  it("does not let the app role touch columns submission does not set", async () => {
    const message = await captureErrorText(
      asTenant("A", (tx) => tx.update(projects).set({ revisionRoundsGranted: 99 }).where(eq(projects.id, projectA))),
    );
    expect(message).toMatch(/permission denied for table projects/);
  });

  it("lets staff move a project through any state", async () => {
    await dbs.staff.db.update(projects).set({ status: "building" }).where(eq(projects.id, projectA));
    await dbs.staff.db.update(projects).set({ status: "on_hold", onHoldReason: "Waiting on photos" }).where(eq(projects.id, projectA));
    expect(await asTenant("A", findOpenProject)).toMatchObject({ status: "on_hold", onHoldReason: "Waiting on photos" });
  });

  it("allows one open project per business, and any number of closed ones", async () => {
    const message = await captureErrorText(dbs.staff.db.insert(projects).values({ businessId: businessA, kind: "redesign" }));
    expect(message).toMatch(/projects_one_open_per_business_idx/);

    await dbs.staff.db.update(projects).set({ status: "live" }).where(eq(projects.id, projectA));
    await dbs.staff.db.insert(projects).values([
      { businessId: businessA, kind: "redesign", status: "cancelled" },
      { businessId: businessA, kind: "redesign", status: "onboarding" },
    ]);
    const open = await asTenant("A", findOpenProject);
    expect(open).toMatchObject({ kind: "redesign", status: "onboarding" });
    const all = await dbs.staff.db.select({ id: projects.id }).from(projects).where(eq(projects.businessId, businessA));
    expect(all).toHaveLength(3);
  });
});

describe("what the app role may change on its own rows", () => {
  it("cannot rewrite a stored file's key, type or size, only its description and deletion", async () => {
    const mediaId = await fillEveryStep("A");
    const before = await snapshotTenantTables();

    for (const assignment of ["storage_key = 'elsewhere'", "mime_type = 'text/html'", "bytes = 1", "sha256 = 'x'"]) {
      const message = await captureErrorText(
        asTenant("A", (tx) => tx.execute(sql`update media_assets set ${sql.raw(assignment)} where id = ${mediaId}`)),
      );
      expect(message, assignment).toMatch(/permission denied for table media_assets/);
    }
    expect(await snapshotTenantTables()).toEqual(before);

    await asTenant("A", (tx) => updateMediaAltText(tx, mediaId, "New words"));
    await asTenant("A", (tx) => softDeleteMediaAsset(tx, mediaId));
    const stored = await dbs.staff.db
      .select({ altText: mediaAssets.altText, deletedAt: mediaAssets.deletedAt })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaId));
    expect(stored).toMatchObject([{ altText: "New words" }]);
    expect(stored[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("cannot record a media row whose storage key is not built from that row", async () => {
    await fillEveryStep("A");
    const before = await snapshotTenantTables();
    const valid = mediaInput(USER_A, businessA);
    const forgedKeys = [
      // Another business's file, the attack the constraint exists for.
      `t/${businessB}/${valid.id}/display`,
      // Another asset of this same business.
      `t/${businessA}/${newMediaAssetId()}/display`,
      `t/${businessA}/${valid.id}/original`,
      `t/${businessA}/${valid.id}/display/../../${businessB}`,
      "elsewhere",
    ];

    for (const storageKey of forgedKeys) {
      const message = await captureErrorText(
        asTenant("A", (tx) => insertMediaAsset(tx, { ...valid, storageKey })),
      );
      expect(message, storageKey).toMatch(/media_assets_storage_key_check/);
    }

    // Staff are held to it too: the rule is about the data, not who writes it.
    const staffMessage = await captureErrorText(
      dbs.staff.db.execute(
        sql`insert into media_assets (id, business_id, purpose, storage_key, original_filename, mime_type, bytes, width, height, sha256, status, uploaded_by_user_id)
            values (${valid.id}, ${businessA}, 'logo', ${`t/${businessB}/${valid.id}/display`}, 'f', 'image/webp', 1, 1, 1, 'x', 'ready', ${USER_A})`,
      ),
    );
    expect(staffMessage).toMatch(/media_assets_storage_key_check/);
    expect(await snapshotTenantTables()).toEqual(before);

    const stored = await asTenant("A", (tx) => insertMediaAsset(tx, valid));
    expect(stored.storageKey).toBe(`t/${businessA}/${valid.id}/display`);
  });

  it("cannot set a domain's status, by update or by insert", async () => {
    await fillEveryStep("A");
    const before = await snapshotTenantTables();

    for (const assignment of ["status = 'active'", "hostname = 'other.example'", "is_primary = false"]) {
      const message = await captureErrorText(
        asTenant("A", (tx) => tx.execute(sql`update domains set ${sql.raw(assignment)} where business_id = ${businessA}`)),
      );
      expect(message, assignment).toMatch(/permission denied for table domains/);
    }
    const insertMessage = await captureErrorText(
      asTenant("A", (tx) =>
        tx.insert(domains).values({ businessId: businessA, hostname: "second.example", isPrimary: false, status: "active" }),
      ),
    );
    expect(insertMessage).toMatch(/(firstfold_app|webfold_app) may only add a domain as pending/);
    expect(await snapshotTenantTables()).toEqual(before);

    // Staff and system work still set the status.
    await dbs.staff.db.update(domains).set({ status: "active" }).where(eq(domains.businessId, businessA));
    expect(await asTenant("A", getPrimaryDomain)).toMatchObject({ status: "active" });
  });

  it("deletes only opening hours", async () => {
    await fillEveryStep("A");
    for (const table of ["business_profiles", "services", "project_briefs", "domains", "media_assets"]) {
      const message = await captureErrorText(
        asTenant("A", (tx) => tx.execute(sql`delete from ${sql.raw(table)} where business_id = ${businessA}`)),
      );
      expect(message, table).toMatch(new RegExp(`permission denied for table ${table}`));
    }
    const deleted = await asTenant("A", (tx) => tx.execute(sql`delete from business_hours where business_id = ${businessA}`));
    expect(deleted.rowCount).toBe(3);
  });
});

describe("constraints on onboarding data", () => {
  it("rejects an open day without two different times, a mixed-up row, and a day out of range", async () => {
    const invalid = [
      { dayOfWeek: 0, opensAt: "09:00", closesAt: "09:00", closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: null, closesAt: null, closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: "09:00", closesAt: null, closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: null, closesAt: "09:00", closed: false, openAllDay: false },
      // Open all day carries no times, and a day cannot be both closed and open all day.
      { dayOfWeek: 0, opensAt: "09:00", closesAt: "18:00", closed: false, openAllDay: true },
      { dayOfWeek: 0, opensAt: null, closesAt: null, closed: true, openAllDay: true },
    ];
    for (const row of invalid) {
      const message = await captureErrorText(asTenant("A", (tx) => replaceBusinessHours(tx, [row])));
      expect(message, JSON.stringify(row)).toMatch(/business_hours_open_times_check/);
    }
    for (const dayOfWeek of [-1, 7]) {
      const message = await captureErrorText(
        asTenant("A", (tx) =>
          replaceBusinessHours(tx, [{ dayOfWeek, opensAt: null, closesAt: null, closed: true, openAllDay: false }]),
        ),
      );
      expect(message).toMatch(/business_hours_day_of_week_check/);
    }
  });

  it("stores overnight, all-day and closed days", async () => {
    await asTenant("A", (tx) =>
      replaceBusinessHours(tx, [
        { dayOfWeek: 4, opensAt: "18:00", closesAt: "02:00", closed: false, openAllDay: false },
        { dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
        { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
      ]),
    );
    expect(await asTenant("A", getBusinessHours)).toMatchObject([
      { dayOfWeek: 4, opensAt: "18:00:00", closesAt: "02:00:00", closed: false, openAllDay: false },
      { dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
      { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
    ]);
  });

  it("keeps rows written before open_all_day existed valid", async () => {
    // A closed day with stray times was allowed before 0015 and still is; so is every ordinary open day.
    await asTenant("A", (tx) =>
      replaceBusinessHours(tx, [
        { dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00", closed: false, openAllDay: false },
        { dayOfWeek: 6, opensAt: "17:00", closesAt: "09:00", closed: true, openAllDay: false },
      ]),
    );
    expect(await asTenant("A", getBusinessHours)).toHaveLength(2);
  });

  it("lets only one business hold a hostname, whatever its case", async () => {
    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "Example.com", ownerConfirmedAt: SUBMITTED_AT }));
    await asTenant("B", (tx) => savePrimaryDomain(tx, { hostname: "b-original.example", ownerConfirmedAt: null }));

    const attempt = asTenant("B", (tx) => savePrimaryDomain(tx, { hostname: "example.com", ownerConfirmedAt: null }));
    await expect(attempt).rejects.toBeInstanceOf(DomainTakenError);
    await expect(attempt).rejects.toThrow("The domain example.com is already connected to another website.");

    // B keeps the domain it had, and the database refuses the duplicate even without the query layer.
    expect(await asTenant("B", getPrimaryDomain)).toMatchObject({ hostname: "b-original.example" });
    const raw = await captureErrorText(
      dbs.staff.db.insert(domains).values({ businessId: businessB, hostname: "EXAMPLE.COM", isPrimary: false }),
    );
    expect(raw).toMatch(/domains_live_hostname_idx/);

    // Once A moves to another hostname, the old one is free.
    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "a-new.example", ownerConfirmedAt: SUBMITTED_AT }));
    await expect(
      asTenant("B", (tx) => savePrimaryDomain(tx, { hostname: "example.com", ownerConfirmedAt: null })),
    ).resolves.toMatchObject({ hostname: "example.com" });
  });

  it("keeps one live primary domain per business", async () => {
    await asTenant("A", (tx) => savePrimaryDomain(tx, { hostname: "one.example", ownerConfirmedAt: null }));
    const message = await captureErrorText(
      dbs.staff.db.insert(domains).values({ businessId: businessA, hostname: "two.example", isPrimary: true }),
    );
    expect(message).toMatch(/domains_one_primary_per_business_idx/);
    const live = await dbs.staff.db
      .select({ hostname: domains.hostname })
      .from(domains)
      .where(and(eq(domains.businessId, businessA)));
    expect(live).toEqual([{ hostname: "one.example" }]);
  });

  it("does not find media by an id that is not a UUID", async () => {
    expect(await asTenant("A", (tx) => findMediaAsset(tx, "../../etc/passwd"))).toBeNull();
    expect(await asTenant("A", (tx) => updateMediaAltText(tx, "nope", "x"))).toBe(false);
  });
});
