import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { submitProject } from "./queries/projects";
import { businesses, businessMembers, projectEvents, projectPreviewImages, projects, users, type ProjectStatus } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "pw-owner";
const OTHER_OWNER = "pw-other-owner";
const NOW = new Date("2026-11-02T04:30:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let projectId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function makeBusiness(slug: string, owner: string): Promise<{ readonly businessId: string; readonly projectId: string }> {
  const [business] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  await dbs.staff.db.insert(businessMembers).values({ businessId: business.id, userId: owner, role: "owner" });
  const [project] = await dbs.staff.db.insert(projects).values({ businessId: business.id }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  return { businessId: business.id, projectId: project.id };
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Riley Owner", email: "riley@example.com" },
    { id: OTHER_OWNER, name: "Sam Other", email: "sam@example.com" },
  ]);
  ({ businessId, projectId } = await makeBusiness("harbour-bakery", OWNER));
  ({ businessId: otherBusinessId } = await makeBusiness("birch-dental", OTHER_OWNER));
});

const asOwner = <T>(work: (tx: ScopedTransaction) => Promise<T>) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: (tx: ScopedTransaction) => Promise<T>) =>
  withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

/** Postgres reports a missing privilege as SQLSTATE 42501 and a failed check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

async function setStatus(status: ProjectStatus, reason: string | null = null): Promise<void> {
  await dbs.staff.db.update(projects).set({ status, onHoldReason: reason }).where(eq(projects.id, projectId));
}

async function eventStatuses(): Promise<ProjectStatus[]> {
  const rows = await dbs.owner.db.select({ status: projectEvents.status }).from(projectEvents).where(eq(projectEvents.projectId, projectId)).orderBy(projectEvents.occurredAt, projectEvents.id);
  return rows.map((row) => row.status);
}

const PICTURE = { projectId: "", businessId: "", previewUrl: "https://preview.example.com", contentType: "image/webp", width: 1280, height: 800, image: Buffer.from("webp") };

describe("project history and preview picture: who can write", () => {
  it("lets the customer role write neither table", async () => {
    await dbs.staff.db.insert(projectPreviewImages).values({ ...PICTURE, projectId, businessId });
    const [event] = await dbs.owner.db.select().from(projectEvents).where(eq(projectEvents.projectId, projectId)).limit(1);
    if (event === undefined) throw new Error("Expected the seed project to have an event");

    const attempts: readonly (() => Promise<unknown>)[] = [
      () => dbs.app.db.execute(sql`insert into project_events (id, project_id, business_id, status) values (gen_random_uuid(), ${projectId}, ${businessId}, 'building')`),
      () => dbs.app.db.execute(sql`update project_events set reason = null`),
      () => dbs.app.db.execute(sql`delete from project_events`),
      () => dbs.app.db.insert(projectPreviewImages).values({ ...PICTURE, projectId: otherBusinessId, businessId }),
      () => dbs.app.db.update(projectPreviewImages).set({ previewUrl: "https://elsewhere.example.com" }),
      () => dbs.app.db.delete(projectPreviewImages),
    ];
    for (const attempt of attempts) expect(await sqlState(attempt)).toBe("42501");
    expect(await dbs.owner.db.select().from(projectPreviewImages)).toHaveLength(1);
  });

  it("keeps staff from writing the history by hand: only the trigger does", async () => {
    expect(
      await sqlState(() =>
        dbs.staff.db.execute(sql`insert into project_events (id, project_id, business_id, status) values (gen_random_uuid(), ${projectId}, ${businessId}, 'building')`),
      ),
    ).toBe("42501");
    expect(await sqlState(() => dbs.staff.db.execute(sql`update project_events set reason = null`))).toBe("42501");
    expect(await sqlState(() => dbs.staff.db.execute(sql`delete from project_events`))).toBe("42501");
  });

  it("deletes a project's history with the project, and nothing else", async () => {
    await dbs.staff.db.delete(projects).where(eq(projects.id, projectId));
    expect(await dbs.owner.db.select({ projectId: projectEvents.projectId }).from(projectEvents).where(eq(projectEvents.projectId, projectId))).toEqual([]);
    expect(await dbs.owner.db.select().from(projectEvents)).toHaveLength(1);
  });

  it("shows a business its own history and picture and nobody else's", async () => {
    await dbs.staff.db.insert(projectPreviewImages).values({ ...PICTURE, projectId, businessId });
    expect(await asOwner((tx) => tx.select().from(projectEvents))).toHaveLength(1);
    expect(await asOwner((tx) => tx.select().from(projectPreviewImages))).toHaveLength(1);
    const others = await asOtherOwner((tx) => tx.select({ projectId: projectEvents.projectId }).from(projectEvents));
    expect(others).toHaveLength(1);
    expect(others.map((row) => row.projectId)).not.toContain(projectId);
    expect(await asOtherOwner((tx) => tx.select().from(projectPreviewImages))).toEqual([]);
  });
});

describe("the trigger that writes the history", () => {
  it("writes an onboarding event when a project is inserted", async () => {
    expect(await eventStatuses()).toEqual(["onboarding"]);
  });

  it("writes a submitted event for the customer's own submit, which is why the trigger is SECURITY DEFINER", async () => {
    await asOwner((tx) => submitProject(tx, { projectId, now: NOW }));
    expect(await eventStatuses()).toEqual(["onboarding", "submitted"]);
  });

  it("writes nothing for an update that does not change the status", async () => {
    await setStatus("submitted");
    await dbs.staff.db.update(projects).set({ previewUrl: "https://preview.example.com", status: "submitted" }).where(eq(projects.id, projectId));
    await dbs.staff.db.update(projects).set({ revisionRoundsGranted: 1 }).where(eq(projects.id, projectId));
    expect(await eventStatuses()).toEqual(["onboarding", "submitted"]);
  });

  it("keeps the pause reason on the on_hold event only", async () => {
    await setStatus("on_hold", "Waiting for your logo");
    await setStatus("building");
    const rows = await dbs.owner.db.select({ status: projectEvents.status, reason: projectEvents.reason }).from(projectEvents).where(eq(projectEvents.projectId, projectId)).orderBy(projectEvents.occurredAt, projectEvents.id);
    expect(rows.filter((row) => row.reason !== null)).toEqual([{ status: "on_hold", reason: "Waiting for your logo" }]);
  });
});

describe("the pause reason rule", () => {
  it("refuses a reason on a project that is not paused", async () => {
    expect(await sqlState(() => setStatus("building", "Waiting for your logo"))).toBe("23514");
  });

  it("refuses a reason of 2 characters, trimmed or not, and one over 200", async () => {
    expect(await sqlState(() => setStatus("on_hold", "ab"))).toBe("23514");
    expect(await sqlState(() => setStatus("on_hold", "  ab  "))).toBe("23514");
    expect(await sqlState(() => setStatus("on_hold", "x".repeat(201)))).toBe("23514");
    expect(await sqlState(() => setStatus("on_hold", "abc"))).toBeUndefined();
  });
});
