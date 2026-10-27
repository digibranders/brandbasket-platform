import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addStaffMember,
  countActiveAdmins,
  findActiveStaffMember,
  findStaffMember,
  findStaffMemberByEmail,
  listStaffRoster,
  setStaffRole,
  switchOffStaffMember,
  switchOnStaffMember,
} from "./queries/staff";
import { sessions, staffAccessLog, staffMembers, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const RIYA = "staff-riya";
const ROHIT = "staff-rohit";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: RIYA, name: "Riya Kapoor", email: "riya@brandbasket.in", emailVerified: true },
    { id: ROHIT, name: "Rohit Mehra", email: "rohit@brandbasket.in", emailVerified: true },
  ]);
  await dbs.owner.db.insert(staffMembers).values([
    { userId: RIYA, role: "admin" },
    { userId: ROHIT, role: "support" },
  ]);
});

describe("the staff roster", () => {
  it("lists everyone with their last successful sign-in, active people first", async () => {
    await dbs.owner.db.insert(staffAccessLog).values([
      { staffUserId: ROHIT, action: "staff.sign_in", result: "ok", createdAt: new Date("2026-11-29T10:00:00.000Z") },
      { staffUserId: ROHIT, action: "staff.sign_in", result: "failed", createdAt: new Date("2026-11-30T10:00:00.000Z") },
    ]);
    await switchOffStaffMember(dbs.staff.db, RIYA);
    const roster = await listStaffRoster(dbs.staff.db);
    expect(roster.map((row) => [row.name, row.active])).toEqual([
      ["Rohit Mehra", true],
      ["Riya Kapoor", false],
    ]);
    expect(roster[0]?.lastSignInAt).toEqual(new Date("2026-11-29T10:00:00.000Z"));
    expect(roster[1]?.lastSignInAt).toBeNull();
  });

  it("finds a member by id or by address, active or not", async () => {
    expect(await findStaffMember(dbs.staff.db, ROHIT)).toEqual({ userId: ROHIT, role: "support", active: true });
    expect(await findStaffMemberByEmail(dbs.staff.db, " Rohit@BrandBasket.in ")).toEqual({ userId: ROHIT, role: "support", active: true });
    expect(await findStaffMember(dbs.staff.db, "nobody")).toBeNull();
  });

  it("changes a role and counts active admins", async () => {
    expect(await countActiveAdmins(dbs.staff.db)).toBe(1);
    expect(await setStaffRole(dbs.staff.db, ROHIT, "admin")).toBe(true);
    expect(await countActiveAdmins(dbs.staff.db)).toBe(2);
    expect(await setStaffRole(dbs.staff.db, "nobody", "admin")).toBe(false);
  });

  it("switching off ends every session and closes the console to them", async () => {
    await dbs.owner.db.insert(sessions).values([
      { id: "s1", token: "t1", userId: ROHIT, expiresAt: new Date("2026-12-30T00:00:00.000Z") },
      { id: "s2", token: "t2", userId: ROHIT, expiresAt: new Date("2026-12-30T00:00:00.000Z") },
      { id: "s3", token: "t3", userId: RIYA, expiresAt: new Date("2026-12-30T00:00:00.000Z") },
    ]);
    expect(await switchOffStaffMember(dbs.staff.db, ROHIT)).toBe(true);
    const left = await dbs.owner.db.select({ id: sessions.id }).from(sessions);
    expect(left.map((row) => row.id)).toEqual(["s3"]);
    expect(await findActiveStaffMember(dbs.staff.db, ROHIT)).toBeNull();
    expect(await switchOffStaffMember(dbs.staff.db, ROHIT)).toBe(false);
  });

  it("switching back on opens the console again", async () => {
    await switchOffStaffMember(dbs.staff.db, ROHIT);
    expect(await switchOnStaffMember(dbs.staff.db, ROHIT)).toBe(true);
    expect(await findActiveStaffMember(dbs.staff.db, ROHIT)).toEqual({ userId: ROHIT, role: "support" });
  });

  it("adding a member who is already there switches them on with the new role", async () => {
    await switchOffStaffMember(dbs.staff.db, ROHIT);
    await addStaffMember(dbs.staff.db, { userId: ROHIT, role: "finance" });
    expect(await findStaffMember(dbs.staff.db, ROHIT)).toEqual({ userId: ROHIT, role: "finance", active: true });
  });
});
