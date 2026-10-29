import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { markProjectReadyAfterKickoff } from "./queries/kickoff-build";
import { listLaunchChecks, LAUNCH_CHECK_KEYS, missingLaunchChecks, setLaunchCheck } from "./queries/project-launch-checks";
import { listPreviewVersions, recordPreviewVersion } from "./queries/project-preview-versions";
import { ProjectCannotStartBuildingError, resumeProject, setProjectBuilding, setProjectOnHold } from "./queries/project-website";
import {
  approveProjectPreview,
  insertOnboardingProject,
  markProjectLive,
  ProjectNotApprovedError,
  ProjectNotAwaitingResponseError,
  ProjectNotReadyForPreviewError,
  recordProjectPreviewSent,
  requestProjectRevisions,
} from "./queries/projects";
import { businesses, bundledAddOns, projectEvents, projects, users, type ProjectStatus } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF = "pcm-staff";
const OWNER = "pcm-owner";
const KICKOFF_NOW = new Date("2026-10-30T12:00:00.000Z");
const DUE_FIRST = new Date("2026-11-01T09:00:00.000Z");
const DUE_LATER = new Date("2026-12-01T09:00:00.000Z");
const PREVIEW_ONE = "https://lotus-one.example.com";
const PREVIEW_TWO = "https://lotus-two.example.com";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

interface Seeded {
  readonly businessId: string;
  readonly projectId: string;
}

/**
 * A business with an active bundled add-on set and its onboarding project, opened the way production opens one: the
 * kickoff-first path, which leaves the customer checklist stamp (`onboarding_submitted_at`) null.
 */
async function createBusiness(slug: string, services: readonly string[]): Promise<Seeded> {
  const [row] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  const businessId = row?.id ?? "";
  if (businessId === "") throw new Error("Seed business was not inserted");
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No INR managed plan seeded");
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${slug}`,
  });
  for (const addOn of services) {
    await dbs.staff.db.insert(bundledAddOns).values({
      businessId,
      subscriptionId: subscription.id,
      addOn,
      listAmountCents: 299_900,
      netAmountCents: 299_900,
      taxRateBasisPoints: 1_800,
      status: "active",
    });
  }
  const project = await dbs.staff.db.transaction((tx) => insertOnboardingProject(tx, businessId));
  return { businessId, projectId: project.id };
}

/** A managed-website business whose onboarding project has been moved to submitted by the kickoff. */
async function createSubmittedSite(slug: string, due: Date = DUE_FIRST): Promise<Seeded> {
  const seeded = await createBusiness(slug, ["managed-website", "digital-growth"]);
  expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: seeded.businessId, dueAt: due, now: KICKOFF_NOW })).toBe(true);
  return seeded;
}

async function projectOf(businessId: string): Promise<typeof projects.$inferSelect> {
  const [row] = await dbs.owner.db.select().from(projects).where(eq(projects.businessId, businessId));
  if (row === undefined) throw new Error(`No project for business ${businessId}`);
  return row;
}

async function eventStatuses(projectId: string): Promise<ProjectStatus[]> {
  const rows = await dbs.owner.db
    .select({ status: projectEvents.status })
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(projectEvents.occurredAt, projectEvents.id);
  return rows.map((row) => row.status);
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "pcm-staff@example.com", emailVerified: true },
    { id: OWNER, name: "Owner", email: "pcm-owner@example.com", emailVerified: true },
  ]);
});

describe("the full walk from onboarding to live", () => {
  it("moves through every status with onboarding_submitted_at still null, and records each step in project_events", async () => {
    const { businessId, projectId } = await createBusiness("walk-bakery", ["managed-website"]);
    expect(await projectOf(businessId)).toMatchObject({ status: "onboarding", onboardingSubmittedAt: null });

    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId, dueAt: DUE_FIRST, now: KICKOFF_NOW })).toBe(true);
    expect(await projectOf(businessId)).toMatchObject({ status: "submitted", onboardingSubmittedAt: null });

    await setProjectBuilding(dbs.staff.db, { businessId });
    expect(await projectOf(businessId)).toMatchObject({ status: "building", onboardingSubmittedAt: null });

    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: new Date("2026-11-02T10:00:00.000Z") });
    expect(await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: PREVIEW_ONE, sentAt: new Date("2026-11-02T10:00:00.000Z"), staffId: STAFF })).toBe(1);
    expect(await projectOf(businessId)).toMatchObject({ status: "preview", previewUrl: PREVIEW_ONE, onboardingSubmittedAt: null });

    await approveProjectPreview(dbs.staff.db, { businessId, now: new Date("2026-11-03T10:00:00.000Z") });
    expect(await projectOf(businessId)).toMatchObject({ status: "approved", onboardingSubmittedAt: null });

    await markProjectLive(dbs.staff.db, { businessId, now: new Date("2026-11-04T10:00:00.000Z") });
    expect(await projectOf(businessId)).toMatchObject({ status: "live", onboardingSubmittedAt: null });
    expect((await projectOf(businessId)).launchedAt).toBeInstanceOf(Date);

    expect(await eventStatuses(projectId)).toEqual(["onboarding", "submitted", "building", "preview", "approved", "live"]);
  });
});

describe("the revisions loop", () => {
  it("sends a second preview after a revision round: version 2, one round granted", async () => {
    const { businessId, projectId } = await createSubmittedSite("loop-bakery");
    await setProjectBuilding(dbs.staff.db, { businessId });
    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW });
    expect(await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: PREVIEW_ONE, sentAt: KICKOFF_NOW, staffId: STAFF })).toBe(1);

    await requestProjectRevisions(dbs.staff.db, { businessId, now: new Date("2026-11-02T10:00:00.000Z") });
    expect(await projectOf(businessId)).toMatchObject({ status: "revisions", revisionRoundsGranted: 1 });

    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_TWO, now: new Date("2026-11-03T10:00:00.000Z") });
    expect(await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: PREVIEW_TWO, sentAt: new Date("2026-11-03T10:00:00.000Z"), staffId: STAFF })).toBe(2);

    const project = await projectOf(businessId);
    expect(project).toMatchObject({ status: "preview", previewUrl: PREVIEW_TWO, revisionRoundsGranted: 1, onboardingSubmittedAt: null });
    expect((await listPreviewVersions(dbs.staff.db, { projectId, businessId })).map((row) => row.version)).toEqual([2, 1]);
  });
});

describe("two staff acting at once", () => {
  it("lets exactly one preview send through when two run together on a submitted project", async () => {
    const { businessId, projectId } = await createSubmittedSite("race-preview");
    const results = await Promise.allSettled([
      recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW }),
      recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_TWO, now: KICKOFF_NOW }),
    ]);

    const won = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof recordProjectPreviewSent>>> => result.status === "fulfilled");
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.reason).toBeInstanceOf(ProjectNotReadyForPreviewError);
    expect((await projectOf(businessId)).previewUrl).toBe(won[0]?.value.previewUrl);
    expect((await eventStatuses(projectId)).filter((status) => status === "preview")).toHaveLength(1);
  });

  it("lets exactly one launch through when two run together on an approved project", async () => {
    const { businessId, projectId } = await createSubmittedSite("race-launch");
    await setProjectBuilding(dbs.staff.db, { businessId });
    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW });
    await approveProjectPreview(dbs.staff.db, { businessId, now: KICKOFF_NOW });

    const results = await Promise.allSettled([
      markProjectLive(dbs.staff.db, { businessId, now: KICKOFF_NOW }),
      markProjectLive(dbs.staff.db, { businessId, now: KICKOFF_NOW }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(lost).toHaveLength(1);
    expect(lost[0]?.reason).toBeInstanceOf(ProjectNotApprovedError);
    expect((await projectOf(businessId)).status).toBe("live");
    expect((await eventStatuses(projectId)).filter((status) => status === "live")).toHaveLength(1);
  });

  it("refuses a second revision request once the first has moved the project out of preview", async () => {
    const { businessId } = await createSubmittedSite("race-revisions");
    await setProjectBuilding(dbs.staff.db, { businessId });
    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW });

    await requestProjectRevisions(dbs.staff.db, { businessId, now: KICKOFF_NOW });
    await expect(requestProjectRevisions(dbs.staff.db, { businessId, now: KICKOFF_NOW })).rejects.toBeInstanceOf(ProjectNotAwaitingResponseError);
    expect((await projectOf(businessId)).revisionRoundsGranted).toBe(1);
  });
});

describe("a tampered business id", () => {
  it("never moves the first business's project when another business's id is passed", async () => {
    const site = await createSubmittedSite("tamper-site");
    const other = await createBusiness("tamper-other", ["managed-website"]);
    const siteEvents = await eventStatuses(site.projectId);

    await expect(
      recordProjectPreviewSent(dbs.staff.db, { businessId: other.businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW }),
    ).rejects.toBeInstanceOf(ProjectNotReadyForPreviewError);
    await expect(setProjectBuilding(dbs.staff.db, { businessId: other.businessId })).rejects.toBeInstanceOf(ProjectCannotStartBuildingError);
    await expect(markProjectLive(dbs.staff.db, { businessId: other.businessId, now: KICKOFF_NOW })).rejects.toBeInstanceOf(ProjectNotApprovedError);

    expect(await projectOf(site.businessId)).toMatchObject({ status: "submitted", previewUrl: null, launchedAt: null });
    expect(await eventStatuses(site.projectId)).toEqual(siteEvents);

    await setProjectBuilding(dbs.staff.db, { businessId: site.businessId });
    await recordProjectPreviewSent(dbs.staff.db, { businessId: site.businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW });
    await approveProjectPreview(dbs.staff.db, { businessId: site.businessId, now: KICKOFF_NOW });
    await expect(markProjectLive(dbs.staff.db, { businessId: other.businessId, now: KICKOFF_NOW })).rejects.toBeInstanceOf(ProjectNotApprovedError);
    expect(await projectOf(site.businessId)).toMatchObject({ status: "approved", launchedAt: null });
    expect(await projectOf(other.businessId)).toMatchObject({ status: "onboarding" });
  });
});

describe("the kickoff move", () => {
  it("returns true once, then false, and keeps the first preview date", async () => {
    const { businessId } = await createBusiness("kickoff-once", ["managed-website"]);

    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId, dueAt: DUE_FIRST, now: KICKOFF_NOW })).toBe(true);
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId, dueAt: DUE_LATER, now: KICKOFF_NOW })).toBe(false);

    const project = await projectOf(businessId);
    expect(project).toMatchObject({ status: "submitted", onboardingSubmittedAt: null });
    expect(project.slaDueAt?.toISOString()).toBe(DUE_FIRST.toISOString());
  });

  it("returns false and leaves a business without an active managed website in onboarding", async () => {
    const { businessId } = await createBusiness("social-only", ["digital-growth"]);

    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId, dueAt: DUE_FIRST, now: KICKOFF_NOW })).toBe(false);
    expect(await projectOf(businessId)).toMatchObject({ status: "onboarding", slaDueAt: null });
  });
});

describe("launch checks", () => {
  it("shrinks the missing list as checks are ticked and restores it as they are unticked", async () => {
    const { businessId, projectId } = await createSubmittedSite("checks-bakery");
    const checkedKeys = async (): Promise<readonly (typeof LAUNCH_CHECK_KEYS)[number][]> =>
      (await listLaunchChecks(dbs.staff.db, { projectId, businessId })).map((check) => check.key);

    expect(missingLaunchChecks(await checkedKeys())).toEqual(LAUNCH_CHECK_KEYS);

    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "dns_and_https", staffId: STAFF, checked: true, now: KICKOFF_NOW });
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "key_pages_load", staffId: STAFF, checked: true, now: KICKOFF_NOW });
    expect(missingLaunchChecks(await checkedKeys())).toEqual(LAUNCH_CHECK_KEYS.filter((key) => key !== "dns_and_https" && key !== "key_pages_load"));

    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "dns_and_https", staffId: STAFF, checked: false, now: KICKOFF_NOW });
    expect(missingLaunchChecks(await checkedKeys())).toEqual(LAUNCH_CHECK_KEYS.filter((key) => key !== "key_pages_load"));

    for (const key of LAUNCH_CHECK_KEYS) {
      await setLaunchCheck(dbs.staff.db, { projectId, businessId, key, staffId: STAFF, checked: true, now: KICKOFF_NOW });
    }
    expect(missingLaunchChecks(await checkedKeys())).toEqual([]);
  });
});

describe("pause and resume", () => {
  it("returns a project paused from submitted to submitted", async () => {
    const { businessId, projectId } = await createSubmittedSite("pause-submitted");

    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" });
    expect(await projectOf(businessId)).toMatchObject({ status: "on_hold", onHoldReason: "Waiting for your logo" });

    const resumed = await resumeProject(dbs.staff.db, { businessId });
    expect(resumed).toMatchObject({ status: "submitted", onHoldReason: null });
    expect(await projectOf(businessId)).toMatchObject({ status: "submitted", onHoldReason: null, onboardingSubmittedAt: null });
    expect(await eventStatuses(projectId)).toEqual(["onboarding", "submitted", "on_hold", "submitted"]);
  });

  it("returns a project paused from preview to preview", async () => {
    const { businessId } = await createSubmittedSite("pause-preview");
    await setProjectBuilding(dbs.staff.db, { businessId });
    await recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: PREVIEW_ONE, now: KICKOFF_NOW });

    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your photos" });
    expect((await resumeProject(dbs.staff.db, { businessId })).status).toBe("preview");
    expect(await projectOf(businessId)).toMatchObject({ status: "preview", previewUrl: PREVIEW_ONE });
  });
});
