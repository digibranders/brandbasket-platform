import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assignProjectBuilder,
  cancelProject,
  grantRevisionRound,
  ProjectBuilderNotStaffError,
  ProjectMoveRefusedError,
  putProjectOnHold,
  resumeProject,
  setProjectBuilding,
} from "./queries/project-staff";
import { businesses, businessMembers, projects, staffMembers, users, type ProjectStatus } from "./schema";
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

describe("setProjectBuilding", () => {
  it("moves a submitted build to building", async () => {
    await setProjectStatus("submitted");
    await expect(setProjectBuilding(dbs.staff.db, projectId)).resolves.toMatchObject({ id: projectId, businessId, status: "building" });
  });

  it("refuses a build still in onboarding and changes nothing", async () => {
    await expect(setProjectBuilding(dbs.staff.db, projectId)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
    expect((await readProject()).status).toBe("onboarding");
  });
});

describe("putProjectOnHold and resumeProject", () => {
  it("holds a build with its reason and remembers where it was, then resumes it there", async () => {
    await setProjectStatus("building");
    await expect(putProjectOnHold(dbs.staff.db, projectId, "  Waiting for photos  ")).resolves.toMatchObject({ status: "on_hold" });
    expect(await readProject()).toMatchObject({ status: "on_hold", onHoldReason: "Waiting for photos", statusBeforeHold: "building" });

    await expect(resumeProject(dbs.staff.db, projectId)).resolves.toMatchObject({ status: "building" });
    expect(await readProject()).toMatchObject({ status: "building", onHoldReason: null, statusBeforeHold: null });
  });

  it("resumes a build held before this column existed into building", async () => {
    await dbs.staff.db.update(projects).set({ status: "on_hold", onHoldReason: "Old hold" }).where(eq(projects.id, projectId));
    await expect(resumeProject(dbs.staff.db, projectId)).resolves.toMatchObject({ status: "building" });
  });

  it("refuses an empty reason, a reason over 200 characters, and a second hold", async () => {
    await setProjectStatus("building");
    await expect(putProjectOnHold(dbs.staff.db, projectId, "   ")).rejects.toBeInstanceOf(ProjectMoveRefusedError);
    await expect(putProjectOnHold(dbs.staff.db, projectId, "x".repeat(201))).rejects.toBeInstanceOf(ProjectMoveRefusedError);
    await putProjectOnHold(dbs.staff.db, projectId, "Waiting for photos");
    await expect(putProjectOnHold(dbs.staff.db, projectId, "Again")).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });

  it("refuses to resume a build that is not on hold", async () => {
    await setProjectStatus("building");
    await expect(resumeProject(dbs.staff.db, projectId)).rejects.toBeInstanceOf(ProjectMoveRefusedError);
  });
});

describe("cancelProject", () => {
  it("cancels a build on hold and clears where it was", async () => {
    await setProjectStatus("building");
    await putProjectOnHold(dbs.staff.db, projectId, "Client stopped replying");
    await expect(cancelProject(dbs.staff.db, projectId)).resolves.toMatchObject({ status: "cancelled" });
    expect(await readProject()).toMatchObject({ status: "cancelled", statusBeforeHold: null });
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
