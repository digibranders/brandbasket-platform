import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActiveStaffMember, findActiveStaffUserIdByEmail } from "./queries/staff";
import { staffMembers, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

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
    { id: "staff-asha", name: "Asha", email: "asha@fynix.digital", emailVerified: true },
    { id: "staff-left", name: "Ravi", email: "ravi@fynix.digital", emailVerified: true },
    { id: "owner-1", name: "Meera", email: "meera@example.com", emailVerified: true },
  ]);
  await dbs.owner.db.insert(staffMembers).values([
    { userId: "staff-asha", active: true },
    { userId: "staff-left", active: false },
  ]);
});

describe("findActiveStaffUserIdByEmail", () => {
  it("finds an active staff member by the address they sign in with", async () => {
    expect(await findActiveStaffUserIdByEmail(dbs.staff.db, "asha@fynix.digital")).toBe("staff-asha");
  });

  it("finds nothing for a deactivated staff member or a customer", async () => {
    expect(await findActiveStaffUserIdByEmail(dbs.staff.db, "ravi@fynix.digital")).toBeNull();
    expect(await findActiveStaffUserIdByEmail(dbs.staff.db, "meera@example.com")).toBeNull();
    expect(await findActiveStaffUserIdByEmail(dbs.staff.db, "nobody@example.com")).toBeNull();
  });
});

describe("staff roles", () => {
  it("makes every staff member an admin unless told otherwise, so nobody loses access", async () => {
    expect(await findActiveStaffMember(dbs.staff.db, "staff-asha")).toEqual({ userId: "staff-asha", role: "admin" });
  });

  it("returns the role a staff member was given", async () => {
    await dbs.owner.db.insert(users).values({ id: "staff-finance", name: "Kiran", email: "kiran@fynix.digital", emailVerified: true });
    await dbs.owner.db.insert(staffMembers).values({ userId: "staff-finance", role: "finance" });
    expect(await findActiveStaffMember(dbs.staff.db, "staff-finance")).toEqual({ userId: "staff-finance", role: "finance" });
  });

  it("refuses a role it does not know", async () => {
    await dbs.owner.db.insert(users).values({ id: "staff-odd", name: "Odd", email: "odd@fynix.digital", emailVerified: true });
    const text = await captureErrorText(dbs.owner.db.insert(staffMembers).values({ userId: "staff-odd", role: "superuser" as never }));
    expect(text).toContain("staff_members_role_check");
  });
});
