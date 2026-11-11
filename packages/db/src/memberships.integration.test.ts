import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { removeBusinessMember } from "./queries/memberships";
import { businesses, businessMembers, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "member-owner";
const EDITOR = "member-editor";
const VIEWER = "member-viewer";
let dbs: TestDatabases;
let businessId: string;
let otherBusinessId: string;

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
    { id: EDITOR, name: "Esha Editor", email: "esha@example.com" },
    { id: VIEWER, name: "Vik Viewer", email: "vik@example.com" },
  ]);
  const rows = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" },
      { slug: "other-shop", name: "Other Shop", currency: "INR" },
    ])
    .returning({ id: businesses.id });
  businessId = rows[0]!.id;
  otherBusinessId = rows[1]!.id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId, userId: EDITOR, role: "editor" },
    { businessId, userId: VIEWER, role: "viewer" },
    { businessId: otherBusinessId, userId: EDITOR, role: "editor" },
  ]);
});

async function isMember(business: string, userId: string): Promise<boolean> {
  const rows = await dbs.owner.db
    .select({ userId: businessMembers.userId })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, business), eq(businessMembers.userId, userId)));
  return rows.length > 0;
}

describe("removeBusinessMember", () => {
  it("removes an editor or a viewer from that business only", async () => {
    expect(await removeBusinessMember(dbs.staff.db, { businessId, userId: EDITOR })).toBe(true);
    expect(await removeBusinessMember(dbs.staff.db, { businessId, userId: VIEWER })).toBe(true);
    expect(await isMember(businessId, EDITOR)).toBe(false);
    expect(await isMember(businessId, VIEWER)).toBe(false);
    expect(await isMember(otherBusinessId, EDITOR)).toBe(true);
  });

  it("never removes the owner", async () => {
    expect(await removeBusinessMember(dbs.staff.db, { businessId, userId: OWNER })).toBe(false);
    expect(await isMember(businessId, OWNER)).toBe(true);
  });

  it("is false for someone who is not a member, or already removed", async () => {
    expect(await removeBusinessMember(dbs.staff.db, { businessId: otherBusinessId, userId: VIEWER })).toBe(false);
    expect(await removeBusinessMember(dbs.staff.db, { businessId, userId: EDITOR })).toBe(true);
    expect(await removeBusinessMember(dbs.staff.db, { businessId, userId: EDITOR })).toBe(false);
  });
});
