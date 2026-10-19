import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveProjectPreview,
  markProjectLive,
  ProjectNotApprovedError,
  ProjectNotAwaitingResponseError,
  ProjectNotReadyForPreviewError,
  recordProjectPreviewSent,
  requestProjectRevisions,
} from "./queries/projects";
import { businesses, businessMembers, domains, projects, users, type ProjectStatus } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const SENT_AT = new Date("2026-09-18T12:00:00.000Z");
const OWNER = "owner-1";

let dbs: TestDatabases;
let businessId = "";
let projectId = "";

async function setProjectStatus(status: ProjectStatus): Promise<void> {
  await dbs.staff.db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

function asOwner<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
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
  const [project] = await dbs.staff.db.insert(projects).values({ businessId }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  projectId = project.id;
});

describe("recordProjectPreviewSent", () => {
  it("moves a submitted project to preview and records the url and time", async () => {
    await setProjectStatus("submitted");

    const result = await recordProjectPreviewSent(dbs.staff.db, {
      businessId,
      previewUrl: "https://harbour-bakery-preview.vercel.app",
      now: SENT_AT,
    });

    expect(result).toMatchObject({
      id: projectId,
      status: "preview",
      previewUrl: "https://harbour-bakery-preview.vercel.app",
      previewSentAt: SENT_AT,
    });
  });

  it("also works from building, and from a second round after revisions", async () => {
    await setProjectStatus("building");
    const fromBuilding = await recordProjectPreviewSent(dbs.staff.db, {
      businessId,
      previewUrl: "https://harbour-bakery-preview.vercel.app",
      now: SENT_AT,
    });
    expect(fromBuilding.status).toBe("preview");

    await setProjectStatus("revisions");
    const fromRevisions = await recordProjectPreviewSent(dbs.staff.db, {
      businessId,
      previewUrl: "https://harbour-bakery-preview.vercel.app/v2",
      now: SENT_AT,
    });
    expect(fromRevisions).toMatchObject({ status: "preview", previewUrl: "https://harbour-bakery-preview.vercel.app/v2" });
  });

  it("throws when the business has not sent us anything yet", async () => {
    // Seeded project defaults to "onboarding" — nothing to preview.
    await expect(
      recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: "https://example.com", now: SENT_AT }),
    ).rejects.toThrow(ProjectNotReadyForPreviewError);
  });

  it("throws rather than re-sending once a preview is already out", async () => {
    await setProjectStatus("preview");
    await expect(
      recordProjectPreviewSent(dbs.staff.db, { businessId, previewUrl: "https://example.com", now: SENT_AT }),
    ).rejects.toThrow(ProjectNotReadyForPreviewError);
  });

  it("throws for a business with no project at all", async () => {
    const [otherBusiness] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "empty-shop", name: "Empty Shop" })
      .returning({ id: businesses.id });
    if (otherBusiness === undefined) throw new Error("Seed business was not inserted");

    await expect(
      recordProjectPreviewSent(dbs.staff.db, {
        businessId: otherBusiness.id,
        previewUrl: "https://example.com",
        now: SENT_AT,
      }),
    ).rejects.toThrow(ProjectNotReadyForPreviewError);
  });
});

describe("approveProjectPreview", () => {
  it("moves a project awaiting a response to approved", async () => {
    await setProjectStatus("preview");

    const result = await approveProjectPreview(dbs.staff.db, { businessId, now: SENT_AT });

    expect(result).toMatchObject({ id: projectId, status: "approved" });
  });

  it("throws when there is nothing to approve yet", async () => {
    // Seeded project defaults to "onboarding" — no preview has been sent.
    await expect(approveProjectPreview(dbs.staff.db, { businessId, now: SENT_AT })).rejects.toThrow(
      ProjectNotAwaitingResponseError,
    );
  });

  it("throws rather than approving the same preview twice", async () => {
    await setProjectStatus("approved");
    await expect(approveProjectPreview(dbs.staff.db, { businessId, now: SENT_AT })).rejects.toThrow(
      ProjectNotAwaitingResponseError,
    );
  });

  it("cannot be done directly as the customer role — the database itself blocks it, not just this function", async () => {
    await setProjectStatus("preview");
    let caught: unknown;
    try {
      await asOwner((tx) => tx.update(projects).set({ status: "approved" }).where(eq(projects.id, projectId)));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).cause)).toMatch(/(bb_app|bb_app) may only move a project from onboarding to submitted/);
  });
});

describe("requestProjectRevisions", () => {
  it("moves a project awaiting a response to revisions and counts the round", async () => {
    await setProjectStatus("preview");

    const result = await requestProjectRevisions(dbs.staff.db, { businessId, now: SENT_AT });

    expect(result).toMatchObject({ id: projectId, status: "revisions", revisionRoundsGranted: 1 });
  });

  it("counts a second round on top of the first", async () => {
    await setProjectStatus("preview");
    await requestProjectRevisions(dbs.staff.db, { businessId, now: SENT_AT });
    await setProjectStatus("preview");

    const result = await requestProjectRevisions(dbs.staff.db, { businessId, now: SENT_AT });

    expect(result).toMatchObject({ revisionRoundsGranted: 2 });
  });

  it("throws when there is nothing to respond to yet", async () => {
    await expect(requestProjectRevisions(dbs.staff.db, { businessId, now: SENT_AT })).rejects.toThrow(
      ProjectNotAwaitingResponseError,
    );
  });
});

describe("markProjectLive", () => {
  async function seedPrimaryDomain(status: "pending" | "active" = "pending"): Promise<void> {
    await dbs.staff.db.insert(domains).values({ businessId, hostname: "harbour-bakery.com", isPrimary: true, status });
  }

  it("moves an approved project to live, stamps launchedAt, and activates its primary domain", async () => {
    await setProjectStatus("approved");
    await seedPrimaryDomain();

    const result = await markProjectLive(dbs.staff.db, { businessId, now: SENT_AT });

    expect(result).toMatchObject({ id: projectId, status: "live", launchedAt: SENT_AT });
    const [domain] = await dbs.staff.db.select().from(domains).where(eq(domains.businessId, businessId));
    expect(domain).toMatchObject({ status: "active" });
  });

  it("launches even without a domain row yet", async () => {
    await setProjectStatus("approved");

    const result = await markProjectLive(dbs.staff.db, { businessId, now: SENT_AT });

    expect(result).toMatchObject({ status: "live" });
  });

  it("throws when the project has not been approved yet", async () => {
    await setProjectStatus("preview");
    await expect(markProjectLive(dbs.staff.db, { businessId, now: SENT_AT })).rejects.toThrow(ProjectNotApprovedError);
  });

  it("throws rather than launching the same project twice", async () => {
    await setProjectStatus("live");
    await expect(markProjectLive(dbs.staff.db, { businessId, now: SENT_AT })).rejects.toThrow(ProjectNotApprovedError);
  });
});
