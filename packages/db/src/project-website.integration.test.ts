import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findPreviewImage,
  findPreviewImageInfo,
  listProjectEvents,
  PauseReasonInvalidError,
  ProjectCannotBePausedError,
  ProjectCannotStartBuildingError,
  ProjectNotPausedError,
  PROJECT_STATUSES_PAUSABLE,
  resumeProject,
  savePreviewImage,
  setProjectBuilding,
  setProjectOnHold,
} from "./queries/project-website";
import { submitProject } from "./queries/projects";
import { businesses, businessMembers, projectEvents, projectPreviewImages, projects, projectStatus, users, type ProjectStatus } from "./schema";
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

/** Puts the project in `status` through the staff connection; a paused project gets a reason, as the database requires. */
async function put(status: ProjectStatus): Promise<void> {
  await setStatus(status, status === "on_hold" ? "Waiting for your logo" : null);
}

async function eventCount(): Promise<number> {
  return (await eventStatuses()).length;
}

async function projectRow(): Promise<{ status: ProjectStatus; onHoldReason: string | null }> {
  const [row] = await dbs.owner.db.select({ status: projects.status, onHoldReason: projects.onHoldReason }).from(projects).where(eq(projects.id, projectId));
  if (row === undefined) throw new Error("The seed project is missing");
  return row;
}

describe("the staff moves, from every status", () => {
  const ALL = projectStatus.enumValues;
  const moves: readonly { readonly name: string; readonly from: readonly ProjectStatus[]; readonly to: (from: ProjectStatus) => ProjectStatus; readonly error: new (...args: never[]) => Error; readonly run: () => Promise<unknown> }[] = [
    { name: "setProjectBuilding", from: ["submitted"], to: () => "building", error: ProjectCannotStartBuildingError, run: () => setProjectBuilding(dbs.staff.db, { businessId }) },
    { name: "setProjectOnHold", from: PROJECT_STATUSES_PAUSABLE, to: () => "on_hold", error: ProjectCannotBePausedError, run: () => setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" }) },
    { name: "resumeProject", from: ["on_hold"], to: () => "building", error: ProjectNotPausedError, run: () => resumeProject(dbs.staff.db, { businessId }) },
  ];

  for (const move of moves) {
    for (const from of ALL) {
      const allowed = move.from.includes(from);
      it(`${move.name} from ${from} ${allowed ? "moves the project and writes one event" : "throws and writes none"}`, async () => {
        await put(from);
        const before = await eventCount();
        if (allowed) {
          await move.run();
          expect(await eventCount()).toBe(before + 1);
        } else {
          await expect(move.run()).rejects.toBeInstanceOf(move.error);
          expect(await eventCount()).toBe(before);
          expect((await projectRow()).status).toBe(from);
        }
      });
    }
  }

  it("works inside a transaction on the staff connection", async () => {
    await put("submitted");
    await dbs.staff.db.transaction((tx) => setProjectBuilding(tx, { businessId }));
    expect((await projectRow()).status).toBe("building");
  });
});

describe("pausing", () => {
  it("trims the reason, and keeps it on the project and its event", async () => {
    await put("building");
    const project = await setProjectOnHold(dbs.staff.db, { businessId, reason: "  Waiting for your logo  " });
    expect(project).toMatchObject({ status: "on_hold", onHoldReason: "Waiting for your logo" });
    const events = await asOwner((tx) => listProjectEvents(tx, projectId));
    expect(events.at(-1)).toMatchObject({ status: "on_hold", reason: "Waiting for your logo" });
  });

  it("refuses a reason of 2 or 201 characters before the database sees it, and accepts 3 and 200", async () => {
    await put("building");
    const before = await eventCount();
    for (const reason of ["ab", "  ab  ", "   ", "x".repeat(201)]) {
      await expect(setProjectOnHold(dbs.staff.db, { businessId, reason })).rejects.toBeInstanceOf(PauseReasonInvalidError);
    }
    expect(await eventCount()).toBe(before);
    expect((await projectRow()).status).toBe("building");

    await setProjectOnHold(dbs.staff.db, { businessId, reason: "x".repeat(200) });
    await resumeProject(dbs.staff.db, { businessId });
    await setProjectOnHold(dbs.staff.db, { businessId, reason: "abc" });
    expect((await projectRow()).status).toBe("on_hold");
  });

  it("leaves one on_hold event when two staff pause at once", async () => {
    await put("building");
    const results = await Promise.allSettled([
      setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" }),
      setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your photos" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ProjectCannotBePausedError);
    expect((await eventStatuses()).filter((status) => status === "on_hold")).toHaveLength(1);
  });
});

describe("resuming", () => {
  const cases: readonly { readonly from: ProjectStatus; readonly lands: ProjectStatus }[] = [
    { from: "submitted", lands: "building" },
    { from: "building", lands: "building" },
    { from: "revisions", lands: "revisions" },
    { from: "preview", lands: "preview" },
  ];
  for (const { from, lands } of cases) {
    it(`returns a project paused from ${from} to ${lands} and clears the reason`, async () => {
      await dbs.staff.db.update(projects).set({ previewUrl: "https://preview.example.com", previewSentAt: NOW }).where(eq(projects.id, projectId));
      await put(from);
      await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" });
      const resumed = await resumeProject(dbs.staff.db, { businessId });
      expect(resumed).toMatchObject({ status: lands, onHoldReason: null });
      expect(await projectRow()).toEqual({ status: lands, onHoldReason: null });
    });
  }

  it("goes back to the latest status before the latest pause after several", async () => {
    await put("submitted");
    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" });
    await resumeProject(dbs.staff.db, { businessId });
    await put("revisions");
    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your photos" });
    expect((await resumeProject(dbs.staff.db, { businessId })).status).toBe("revisions");
  });

  it("falls back to building when the history has nothing before the pause", async () => {
    await put("on_hold");
    await dbs.owner.db.execute(sql`delete from project_events where project_id = ${projectId} and status <> 'on_hold'`);
    expect((await resumeProject(dbs.staff.db, { businessId })).status).toBe("building");
  });

  it("lets only one of two staff resume at once", async () => {
    await put("revisions");
    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" });
    const results = await Promise.allSettled([resumeProject(dbs.staff.db, { businessId }), resumeProject(dbs.staff.db, { businessId })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await eventStatuses()).filter((status) => status === "revisions")).toHaveLength(2);
  });
});

describe("listProjectEvents", () => {
  it("lists a project's history oldest first, and nothing of another business's", async () => {
    await asOwner((tx) => submitProject(tx, { projectId, now: NOW }));
    await setProjectBuilding(dbs.staff.db, { businessId });
    await setProjectOnHold(dbs.staff.db, { businessId, reason: "Waiting for your logo" });
    const events = await asOwner((tx) => listProjectEvents(tx, projectId));
    expect(events.map((event) => event.status)).toEqual(["onboarding", "submitted", "building", "on_hold"]);
    expect(events.map((event) => event.occurredAt.getTime())).toEqual([...events.map((event) => event.occurredAt.getTime())].sort((a, b) => a - b));
    expect(await asOtherOwner((tx) => listProjectEvents(tx, projectId))).toEqual([]);
  });
});

describe("the preview picture", () => {
  const base = () => ({ projectId, businessId, previewUrl: "https://preview.example.com", width: 1280, height: 800 });

  it("keeps one row per project, with the newer bytes", async () => {
    await savePreviewImage(dbs.staff.db, { ...base(), image: Buffer.from("first") });
    await savePreviewImage(dbs.staff.db, { ...base(), previewUrl: "https://preview.example.com/v2", image: Buffer.from("second") });
    expect(await dbs.owner.db.select().from(projectPreviewImages)).toHaveLength(1);
    const found = await asOwner((tx) => findPreviewImage(tx));
    expect(found?.previewUrl).toBe("https://preview.example.com/v2");
    expect(found?.image.toString()).toBe("second");
    expect(await asOwner((tx) => findPreviewImageInfo(tx))).toEqual({ previewUrl: "https://preview.example.com/v2", capturedAt: found?.capturedAt });
  });

  it("returns null when there is none, and for another business's picture", async () => {
    expect(await asOwner((tx) => findPreviewImage(tx))).toBeNull();
    expect(await asOwner((tx) => findPreviewImageInfo(tx))).toBeNull();
    await savePreviewImage(dbs.staff.db, { ...base(), image: Buffer.from("first") });
    expect(await asOtherOwner((tx) => findPreviewImage(tx))).toBeNull();
    expect(await asOtherOwner((tx) => findPreviewImageInfo(tx))).toBeNull();
  });

  it("is refused by the database over 1 MB, and the old picture stays", async () => {
    await savePreviewImage(dbs.staff.db, { ...base(), image: Buffer.from("first") });
    expect(await sqlState(() => savePreviewImage(dbs.staff.db, { ...base(), image: Buffer.alloc(1_048_577) }))).toBe("23514");
    expect((await asOwner((tx) => findPreviewImage(tx)))?.image.toString()).toBe("first");
    expect(await sqlState(() => savePreviewImage(dbs.staff.db, { ...base(), image: Buffer.alloc(1_048_576, 1) }))).toBeUndefined();
  });
});
