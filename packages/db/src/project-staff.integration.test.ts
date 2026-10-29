import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { onboardingProgress, setupCallBookings } from "./schema";
import {
  assignProjectBuilder,
  cancelProject,
  countCallsBetween,
  countLateProjects,
  findOpenProjectForStaff,
  grantRevisionRound,
  listOpenProjectsForStaff,
  listSetupCallsForStaff,
  ProjectBuilderNotStaffError,
  ProjectMoveRefusedError,
  setProjectLaunchPlannedOn,
} from "./queries/project-staff";
import { businesses, businessMembers, projects, staffMembers, users, type ProjectStatus } from "./schema";
import { findLatestProject } from "./queries/projects";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-1";
const BUILDER = "staff-builder-1";

let dbs: TestDatabases;
let businessId = "";
let projectId = "";

async function setProjectStatus(status: ProjectStatus): Promise<void> {
  await dbs.staff.db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function readProject(): Promise<typeof projects.$inferSelect> {
  const [row] = await dbs.staff.db.select().from(projects).where(eq(projects.id, projectId));
  if (row === undefined) throw new Error("Project missing");
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
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Riley Owner", email: "riley@example.com" },
    { id: BUILDER, name: "Rohit Builder", email: "rohit@example.com" },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: BUILDER, role: "support" });
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

describe("cancelProject", () => {
  it("cancels a build on hold", async () => {
    await dbs.staff.db.update(projects).set({ status: "on_hold", onHoldReason: "Client stopped replying" }).where(eq(projects.id, projectId));
    await expect(cancelProject(dbs.staff.db, projectId)).resolves.toMatchObject({ status: "cancelled" });
    expect(await readProject()).toMatchObject({ status: "cancelled", onHoldReason: null });
  });

  it("refuses a live build", async () => {
    await setProjectStatus("live");
    await expect(cancelProject(dbs.staff.db, projectId)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });

  it("refuses an id that is not a uuid without touching the database", async () => {
    await expect(cancelProject(dbs.staff.db, "not-a-uuid")).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });
});

describe("assignProjectBuilder", () => {
  it("assigns an active staff member, and clears the builder with null", async () => {
    await setProjectStatus("building");
    await assignProjectBuilder(dbs.staff.db, projectId, BUILDER);
    expect((await readProject()).assignedStaffId).toBe(BUILDER);

    await assignProjectBuilder(dbs.staff.db, projectId, null);
    expect((await readProject()).assignedStaffId).toBeNull();
  });

  it("refuses someone who is not active staff", async () => {
    await setProjectStatus("building");
    await expect(assignProjectBuilder(dbs.staff.db, projectId, OWNER)).rejects.toBeInstanceOf(ProjectBuilderNotStaffError);
    await dbs.staff.db.update(staffMembers).set({ active: false }).where(eq(staffMembers.userId, BUILDER));
    await expect(assignProjectBuilder(dbs.staff.db, projectId, BUILDER)).rejects.toBeInstanceOf(ProjectBuilderNotStaffError);
  });

  it("refuses a cancelled build", async () => {
    await setProjectStatus("cancelled");
    await expect(assignProjectBuilder(dbs.staff.db, projectId, BUILDER)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });
});

describe("grantRevisionRound", () => {
  it("adds one to the rounds included once a preview has gone out", async () => {
    await setProjectStatus("revisions");
    await grantRevisionRound(dbs.staff.db, projectId);
    expect((await readProject()).revisionRoundsIncluded).toBe(3);
  });

  it("refuses a build that has not had a preview yet", async () => {
    await setProjectStatus("building");
    await expect(grantRevisionRound(dbs.staff.db, projectId)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
    expect((await readProject()).revisionRoundsIncluded).toBe(2);
  });
});

describe("setProjectLaunchPlannedOn", () => {
  it("sets the planned launch day on an open build, shows it to staff, and clears it again", async () => {
    await setProjectStatus("preview");
    await setProjectLaunchPlannedOn(dbs.staff.db, projectId, "2026-12-05");
    expect((await readProject()).launchPlannedOn).toBe("2026-12-05");
    expect((await findOpenProjectForStaff(dbs.staff.db, businessId))?.launchPlannedOn).toBe("2026-12-05");
    await setProjectLaunchPlannedOn(dbs.staff.db, projectId, null);
    expect((await readProject()).launchPlannedOn).toBeNull();
  });

  it("refuses a day that is not a real calendar day, and a build that is finished", async () => {
    await setProjectStatus("approved");
    for (const day of ["2026-02-30", "05/12/2026", "2026-13-01", ""]) {
      await expect(setProjectLaunchPlannedOn(dbs.staff.db, projectId, day)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
    }
    expect((await readProject()).launchPlannedOn).toBeNull();
    await setProjectStatus("cancelled");
    await expect(setProjectLaunchPlannedOn(dbs.staff.db, projectId, "2026-12-05")).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });

  it("is readable by the customer's own role, with no change to what they may write", async () => {
    await setProjectStatus("approved");
    await setProjectLaunchPlannedOn(dbs.staff.db, projectId, "2026-12-05");
    const seen = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findLatestProject(tx));
    expect(seen?.launchPlannedOn).toBe("2026-12-05");
    await expect(
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.update(projects).set({ launchPlannedOn: "2026-12-31" }).where(eq(projects.id, projectId))),
    ).rejects.toThrow();
  });
});

const NOW = new Date("2026-11-30T06:00:00.000Z");
const MONTH_START = new Date("2026-10-31T18:30:00.000Z");

describe("listOpenProjectsForStaff", () => {
  it("returns open builds with the business, builder, due date and call time", async () => {
    await setProjectStatus("building");
    await dbs.staff.db
      .update(projects)
      .set({ slaDueAt: new Date("2026-11-28T06:00:00.000Z"), assignedStaffId: BUILDER })
      .where(eq(projects.id, projectId));
    await dbs.staff.db.insert(setupCallBookings).values({
      businessId,
      startsAt: new Date("2026-11-18T06:00:00.000Z"),
      endsAt: new Date("2026-11-18T06:30:00.000Z"),
    });

    const rows = await listOpenProjectsForStaff(dbs.staff.db, MONTH_START);
    expect(rows).toEqual([
      expect.objectContaining({
        projectId,
        businessId,
        businessName: "Harbour Bakery",
        status: "building",
        slaDueAt: new Date("2026-11-28T06:00:00.000Z"),
        builderId: BUILDER,
        builderName: "Rohit Builder",
        callStartsAt: new Date("2026-11-18T06:00:00.000Z"),
        revisionRoundsIncluded: 2,
        revisionRoundsUsed: 0,
      }),
    ]);
  });

  it("leaves out cancelled builds and builds that went live before this month", async () => {
    await setProjectStatus("cancelled");
    expect(await listOpenProjectsForStaff(dbs.staff.db, MONTH_START)).toEqual([]);

    await dbs.staff.db.update(projects).set({ status: "live", launchedAt: new Date("2026-10-20T06:00:00.000Z") }).where(eq(projects.id, projectId));
    expect(await listOpenProjectsForStaff(dbs.staff.db, MONTH_START)).toEqual([]);

    await dbs.staff.db.update(projects).set({ launchedAt: new Date("2026-11-21T06:00:00.000Z") }).where(eq(projects.id, projectId));
    expect(await listOpenProjectsForStaff(dbs.staff.db, MONTH_START)).toHaveLength(1);
  });
});

describe("findOpenProjectForStaff", () => {
  it("reads the open build's controls, and nothing once it is live", async () => {
    await setProjectStatus("revisions");
    await expect(findOpenProjectForStaff(dbs.staff.db, businessId)).resolves.toMatchObject({
      id: projectId,
      status: "revisions",
      revisionRoundsIncluded: 2,
      revisionRoundsUsed: 0,
      assignedStaffId: null,
      onHoldReason: null,
    });
    await setProjectStatus("live");
    await expect(findOpenProjectForStaff(dbs.staff.db, businessId)).resolves.toBeNull();
  });
});

describe("listSetupCallsForStaff", () => {
  it("lists calls in the window with how many of the four setup steps are done", async () => {
    await dbs.staff.db.insert(setupCallBookings).values({
      businessId,
      startsAt: new Date("2026-11-30T06:00:00.000Z"),
      endsAt: new Date("2026-11-30T06:30:00.000Z"),
    });
    await dbs.staff.db.insert(onboardingProgress).values([
      { projectId, businessId, step: "business", completedAt: NOW },
      { projectId, businessId, step: "content", completedAt: NOW },
      { projectId, businessId, step: "brand", completedAt: null },
      { projectId, businessId, step: "review", completedAt: NOW },
    ]);

    const rows = await listSetupCallsForStaff(dbs.staff.db, new Date("2026-11-23T00:00:00.000Z"), new Date("2026-12-28T00:00:00.000Z"));
    expect(rows).toEqual([
      expect.objectContaining({ businessId, businessName: "Harbour Bakery", startsAt: new Date("2026-11-30T06:00:00.000Z"), setupDone: 2 }),
    ]);
  });

  it("keeps a booking with no reported time, and drops calls outside the window", async () => {
    await dbs.staff.db.insert(setupCallBookings).values({ businessId });
    const rows = await listSetupCallsForStaff(dbs.staff.db, new Date("2026-11-23T00:00:00.000Z"), new Date("2026-12-28T00:00:00.000Z"));
    expect(rows).toEqual([expect.objectContaining({ businessId, startsAt: null, setupDone: 0 })]);

    await dbs.staff.db.update(setupCallBookings).set({ startsAt: new Date("2026-10-01T06:00:00.000Z"), endsAt: new Date("2026-10-01T06:30:00.000Z") });
    expect(await listSetupCallsForStaff(dbs.staff.db, new Date("2026-11-23T00:00:00.000Z"), new Date("2026-12-28T00:00:00.000Z"))).toEqual([]);
  });

  it("leaves out a call staff marked held by phone, which has no time but already happened", async () => {
    await dbs.staff.db.insert(setupCallBookings).values({ businessId, heldAt: NOW, heldByStaffId: BUILDER });
    expect(await listSetupCallsForStaff(dbs.staff.db, new Date("2026-11-23T00:00:00.000Z"), new Date("2026-12-28T00:00:00.000Z"))).toEqual([]);
  });
});

describe("counts", () => {
  it("counts builds past their preview date, and calls in a time range", async () => {
    await setProjectStatus("building");
    await dbs.staff.db.update(projects).set({ slaDueAt: new Date("2026-11-28T06:00:00.000Z") }).where(eq(projects.id, projectId));
    await expect(countLateProjects(dbs.staff.db, NOW)).resolves.toBe(1);
    await expect(countLateProjects(dbs.staff.db, new Date("2026-11-27T06:00:00.000Z"))).resolves.toBe(0);

    await dbs.staff.db.insert(setupCallBookings).values({
      businessId,
      startsAt: new Date("2026-11-30T06:00:00.000Z"),
      endsAt: new Date("2026-11-30T06:30:00.000Z"),
    });
    await expect(countCallsBetween(dbs.staff.db, new Date("2026-11-29T18:30:00.000Z"), new Date("2026-11-30T18:30:00.000Z"))).resolves.toBe(1);
    await expect(countCallsBetween(dbs.staff.db, new Date("2026-11-30T18:30:00.000Z"), new Date("2026-12-01T18:30:00.000Z"))).resolves.toBe(0);
  });
});
