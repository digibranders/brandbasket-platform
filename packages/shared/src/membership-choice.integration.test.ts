import {
  acceptBusinessInvite,
  businessHours,
  businesses,
  businessMembers,
  createBusinessInvite,
  listMembershipsForUser,
  users,
  withTenantScope,
  type Database,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACTIVE_BUSINESS_COOKIE, decideCustomerAccess, type SessionUser } from "./lib/access";

/**
 * Integration test for the membership choice and multi-business customer access against a real Postgres database.
 * Verifies that:
 * 1. An existing user with multiple memberships lands on the selected active business (via activeBusinessId / ACTIVE_BUSINESS_COOKIE),
 *    falling back to the oldest membership when no choice or an unknown choice is present.
 * 2. Accepting an invite adds the membership to the user, allowing them to switch to the invited business.
 * 3. Viewer and editor permissions are enforced by row-level security.
 */

const OWNER = "user-owner";
const MULTI_MEMBER = "user-multi";
const VIEWER = "user-viewer";

const USER_SESSION: SessionUser = {
  id: MULTI_MEMBER,
  name: "Multi Member",
  email: "multi@example.test",
  phone: null,
  emailConfirmed: true,
};

let dbs: TestDatabases;
let staff: Database;
let businessA: string;
let businessB: string;

beforeAll(() => {
  dbs = openTestDatabases();
  staff = dbs.staff.db;
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);

  await staff.insert(users).values([
    { id: OWNER, name: "Owner Person", email: "owner@example.test" },
    { id: MULTI_MEMBER, name: "Multi Member", email: "multi@example.test" },
    { id: VIEWER, name: "Viewer Person", email: "viewer@example.test" },
  ]);

  const [bizA, bizB] = await staff
    .insert(businesses)
    .values([
      { slug: "alpha-clinic", name: "Alpha Clinic", currency: "INR" },
      { slug: "beta-dental", name: "Beta Dental", currency: "INR" },
    ])
    .returning({ id: businesses.id });

  businessA = bizA!.id;
  businessB = bizB!.id;

  // Add initial memberships:
  // Alpha Clinic created first: Owner is owner, Multi Member is viewer
  // Beta Dental created second: Owner is owner, Multi Member is editor
  await staff.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER, role: "owner" },
    { businessId: businessA, userId: MULTI_MEMBER, role: "viewer" },
    { businessId: businessB, userId: OWNER, role: "owner" },
    { businessId: businessB, userId: MULTI_MEMBER, role: "editor" },
  ]);
});

describe("membership choice with multiple memberships", () => {
  it("defaults to the oldest membership when no active business is specified", async () => {
    const memberships = await listMembershipsForUser(dbs.app.db, MULTI_MEMBER);
    expect(memberships).toHaveLength(2);

    const access = decideCustomerAccess(USER_SESSION, memberships, null);
    expect(access.kind).toBe("granted");
    if (access.kind === "granted") {
      expect(access.tenant.businessId).toBe(businessA);
      expect(access.tenant.businessName).toBe("Alpha Clinic");
      expect(access.tenant.role).toBe("viewer");
    }
  });

  it("selects the chosen active business when the user belongs to it", async () => {
    const memberships = await listMembershipsForUser(dbs.app.db, MULTI_MEMBER);

    // Switching to Beta Dental
    const accessB = decideCustomerAccess(USER_SESSION, memberships, businessB);
    expect(accessB.kind).toBe("granted");
    if (accessB.kind === "granted") {
      expect(accessB.tenant.businessId).toBe(businessB);
      expect(accessB.tenant.businessName).toBe("Beta Dental");
      expect(accessB.tenant.role).toBe("editor");
    }

    // Switching to Alpha Clinic
    const accessA = decideCustomerAccess(USER_SESSION, memberships, businessA);
    expect(accessA.kind).toBe("granted");
    if (accessA.kind === "granted") {
      expect(accessA.tenant.businessId).toBe(businessA);
      expect(accessA.tenant.businessName).toBe("Alpha Clinic");
      expect(accessA.tenant.role).toBe("viewer");
    }
  });

  it("falls back to the oldest membership when activeBusinessId is unknown or foreign", async () => {
    const memberships = await listMembershipsForUser(dbs.app.db, MULTI_MEMBER);
    const foreignBusinessId = "00000000-0000-7000-8000-000000000099";

    const access = decideCustomerAccess(USER_SESSION, memberships, foreignBusinessId);
    expect(access.kind).toBe("granted");
    if (access.kind === "granted") {
      expect(access.tenant.businessId).toBe(businessA);
    }
  });

  it("exports the active business cookie name", () => {
    expect(ACTIVE_BUSINESS_COOKIE).toBe("bb_active_business");
  });
});

describe("inviting an existing user into a workspace", () => {
  it("adds membership to the invited business and allows selecting it", async () => {
    // Viewer Person starts with no memberships
    const initialMemberships = await listMembershipsForUser(dbs.app.db, VIEWER);
    expect(initialMemberships).toHaveLength(0);

    // Owner creates an invite for Beta Dental with role editor
    const { token } = await withTenantScope(
      dbs.app.db,
      { userId: OWNER, businessId: businessB },
      (tx) => createBusinessInvite(tx, { invitedBy: OWNER, email: "viewer@example.test", role: "editor" }),
    );

    // Viewer Person accepts the invite
    const acceptResult = await acceptBusinessInvite(staff, {
      token,
      userId: VIEWER,
      userEmail: "viewer@example.test",
    });
    expect(acceptResult).toEqual({ kind: "accepted", businessId: businessB, role: "editor" });

    // Verify membership is now recorded in database
    const updatedMemberships = await listMembershipsForUser(dbs.app.db, VIEWER);
    expect(updatedMemberships).toHaveLength(1);
    expect(updatedMemberships[0]).toMatchObject({ businessId: businessB, role: "editor" });

    // With active business set to businessB, user lands in Beta Dental as editor
    const viewerSession: SessionUser = {
      id: VIEWER,
      name: "Viewer Person",
      email: "viewer@example.test",
      phone: null,
      emailConfirmed: true,
    };
    const access = decideCustomerAccess(viewerSession, updatedMemberships, businessB);
    expect(access.kind).toBe("granted");
    if (access.kind === "granted") {
      expect(access.tenant.businessId).toBe(businessB);
      expect(access.tenant.role).toBe("editor");
    }
  });
});

describe("viewer vs editor permissions on real database", () => {
  it("enforces editor write and viewer read-only via row-level security", async () => {
    // In Beta Dental, MULTI_MEMBER is editor: insert succeeds
    await withTenantScope(
      dbs.app.db,
      { userId: MULTI_MEMBER, businessId: businessB },
      async (tx) => {
        await tx.insert(businessHours).values({ businessId: businessB, dayOfWeek: 1, closed: true });
      },
    );

    // In Alpha Clinic, MULTI_MEMBER is viewer: insert fails under RLS
    let rlsError: unknown = null;
    try {
      await withTenantScope(
        dbs.app.db,
        { userId: MULTI_MEMBER, businessId: businessA },
        async (tx) => {
          await tx.insert(businessHours).values({ businessId: businessA, dayOfWeek: 1, closed: true });
        },
      );
    } catch (error) {
      rlsError = error;
    }
    expect(rlsError).not.toBeNull();
  });
});
