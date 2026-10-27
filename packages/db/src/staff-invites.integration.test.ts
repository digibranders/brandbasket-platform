import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimStaffInvite, createStaffInvite, findOpenStaffInvite, findUsableStaffInvite, listOpenStaffInvites } from "./queries/staff-invites";
import { staffInvites, staffMembers, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const ADMIN = "staff-admin";
const NOW = new Date("2026-11-30T09:00:00.000Z");
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: ADMIN, name: "Riya", email: "riya@brandbasket.in", emailVerified: true });
  await dbs.owner.db.insert(staffMembers).values({ userId: ADMIN, role: "admin" });
});

const INPUT = { email: "  Nikhil@BrandBasket.in ", role: "support" as const, invitedBy: ADMIN, expiresInDays: 3 };

describe("staff invites", () => {
  it("stores only the hash of the token, with the address trimmed and lower case", async () => {
    const created = await createStaffInvite(dbs.staff.db, INPUT, NOW);
    const [row] = await dbs.owner.db.select().from(staffInvites);
    expect(row?.email).toBe("nikhil@brandbasket.in");
    expect(row?.tokenHash).not.toBe(created.token);
    expect(row?.expiresAt).toEqual(new Date("2026-12-03T09:00:00.000Z"));
    expect((await findUsableStaffInvite(dbs.staff.db, created.token, NOW))?.id).toBe(created.invite.id);
  });

  it("revokes the open invite when a new one goes to the same address", async () => {
    const first = await createStaffInvite(dbs.staff.db, INPUT, NOW);
    const second = await createStaffInvite(dbs.staff.db, { ...INPUT, role: "finance" }, NOW);
    expect(await findUsableStaffInvite(dbs.staff.db, first.token, NOW)).toBeNull();
    expect((await findUsableStaffInvite(dbs.staff.db, second.token, NOW))?.role).toBe("finance");
    expect((await listOpenStaffInvites(dbs.staff.db)).map((invite) => invite.id)).toEqual([second.invite.id]);
  });

  it("can be claimed once, and is no longer usable after", async () => {
    const created = await createStaffInvite(dbs.staff.db, INPUT, NOW);
    expect(await claimStaffInvite(dbs.staff.db, created.invite.id, NOW)).toBe(true);
    expect(await claimStaffInvite(dbs.staff.db, created.invite.id, NOW)).toBe(false);
    expect(await findUsableStaffInvite(dbs.staff.db, created.token, NOW)).toBeNull();
    expect(await findOpenStaffInvite(dbs.staff.db, created.invite.id)).toBeNull();
  });

  it("stops working when it expires", async () => {
    const created = await createStaffInvite(dbs.staff.db, INPUT, NOW);
    const later = new Date("2026-12-03T09:00:01.000Z");
    expect(await findUsableStaffInvite(dbs.staff.db, created.token, later)).toBeNull();
    expect(await claimStaffInvite(dbs.staff.db, created.invite.id, later)).toBe(false);
  });

  it("finds an open invite by id for a resend", async () => {
    const created = await createStaffInvite(dbs.staff.db, INPUT, NOW);
    expect(await findOpenStaffInvite(dbs.staff.db, created.invite.id)).toMatchObject({ email: "nikhil@brandbasket.in", role: "support" });
  });
});
