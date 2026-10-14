import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./client";
import { requireEnv } from "./local-env";
import { listMembershipsForUser } from "./queries/memberships";
import { countPlatformRecords, findActiveStaffMember } from "./queries/staff";
import { businesses, businessMembers, staffMembers, users } from "./schema";
import { withCustomerRole, withTenantScope, withUserScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
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
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing" },
      { slug: "bella-vista-bistro", name: "Bella Vista Bistro" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-plumbing");
  businessB = idForSlug(inserted, "bella-vista-bistro");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
});

describe("row-level security for firstfold_app", () => {
  it.each(["firstfold_staff", "webfold_staff"] as const)("lets %s switch to the customer role with tenant isolation", async (role) => {
    await dbs.owner.db.transaction(async (tx) => {
      // Change the session identity as well: SET ROLE alone would retain the owner's permission to switch roles.
      await tx.execute(sql.raw(`set local session authorization ${role}`));
      const rows = await withCustomerRole(tx, { userId: USER_A, businessId: businessA }, (customerTx) =>
        customerTx.select({ id: businesses.id }).from(businesses),
      );
      expect(rows).toEqual([{ id: businessA }]);
      const restored = await tx.execute<{ role: string }>(sql`select current_user as role`);
      expect(restored.rows).toEqual([{ role }]);
    });
  });

  it("returns no businesses when no user scope is set", async () => {
    const rows = await dbs.app.db.select({ id: businesses.id }).from(businesses);
    expect(rows).toEqual([]);
  });

  it("returns only the scoped user's businesses", async () => {
    const rows = await withUserScope(dbs.app.db, USER_A, (tx) => tx.select({ id: businesses.id }).from(businesses));
    expect(rows).toEqual([{ id: businessA }]);
  });

  it("hides other users' membership rows even when filtered by their business id", async () => {
    const rows = await withUserScope(dbs.app.db, USER_A, (tx) =>
      tx.select().from(businessMembers).where(eq(businessMembers.businessId, businessB)),
    );
    expect(rows).toEqual([]);
  });

  it("denies the app role any write to businesses", async () => {
    const message = await captureErrorText(
      withUserScope(dbs.app.db, USER_A, (tx) => tx.insert(businesses).values({ slug: "sneaky", name: "Sneaky" })),
    );
    expect(message).toMatch(/permission denied for table businesses/);
  });

  it("denies the app role any access to staff_members", async () => {
    const message = await captureErrorText(dbs.app.db.select().from(staffMembers));
    expect(message).toMatch(/permission denied for table staff_members/);
  });

  it("sets user and business ids only for the duration of the transaction", async () => {
    const single = createDatabase(requireEnv("DATABASE_URL_TEST"), { max: 1 });
    const readSettings = sql`select current_setting('app.user_id', true) as user_id, current_setting('app.business_id', true) as business_id`;
    try {
      const inside = await withTenantScope(single.db, { userId: USER_A, businessId: businessA }, async (tx) => {
        const result = await tx.execute<{ user_id: string | null; business_id: string | null }>(readSettings);
        return result.rows[0];
      });
      expect(inside).toEqual({ user_id: USER_A, business_id: businessA });

      const after = await single.db.execute<{ user_id: string | null; business_id: string | null }>(readSettings);
      expect(after.rows[0]?.user_id ?? "").toBe("");
      expect(after.rows[0]?.business_id ?? "").toBe("");
    } finally {
      await single.close();
    }
  });

  it("clears the scope after a failed transaction too", async () => {
    const single = createDatabase(requireEnv("DATABASE_URL_TEST"), { max: 1 });
    try {
      const failure = await captureErrorText(
        withUserScope(single.db, USER_A, async () => {
          throw new Error("work failed");
        }),
      );
      expect(failure).toContain("work failed");

      const after = await single.db.execute<{ user_id: string | null }>(
        sql`select current_setting('app.user_id', true) as user_id`,
      );
      expect(after.rows[0]?.user_id ?? "").toBe("");
      expect(await single.db.select({ id: businesses.id }).from(businesses)).toEqual([]);
    } finally {
      await single.close();
    }
  });

  it("rejects an empty user id with a clear error", async () => {
    await expect(withUserScope(dbs.app.db, "", async () => "unreachable")).rejects.toThrow("userId must not be empty");
  });

  it("rejects a business id that is not a UUID with a clear error", async () => {
    await expect(
      withTenantScope(dbs.app.db, { userId: USER_A, businessId: "not-a-uuid" }, async () => "unreachable"),
    ).rejects.toThrow('businessId must be a UUID, received "not-a-uuid"');
  });
});

describe("row-level security coverage", () => {
  // Any new table firstfold_app can read must enable row-level security, or be added to this list on purpose.
  // india_pincodes is India Post's public PIN directory, and the geo_* tables are the geography and category catalog
  // staff edit (migration 0113): the same rows for every business, nothing to scope.
  it("leaves only the auth, rate-limit, PIN directory and geography catalog tables readable by firstfold_app without RLS", async () => {
    const result = await dbs.owner.db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and has_any_column_privilege('firstfold_app', c.oid, 'SELECT')
        and not c.relrowsecurity
      order by c.relname
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "accounts",
      "geo_areas",
      "geo_categories",
      "geo_districts",
      "india_pincodes",
      "rate_limit_buckets",
      "sessions",
      "users",
      "verifications",
    ]);
  });
});

describe("listMembershipsForUser", () => {
  it("orders by membership age, not insertion order", async () => {
    const [ironclad] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "ironclad-builders", name: "Ironclad Builders" })
      .returning({ id: businesses.id });
    if (ironclad === undefined) throw new Error("Seed business was not inserted");
    await dbs.staff.db.insert(businessMembers).values({
      businessId: ironclad.id,
      userId: USER_A,
      role: "editor",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });

    expect(await listMembershipsForUser(dbs.app.db, USER_A)).toEqual([
      { businessId: ironclad.id, businessName: "Ironclad Builders", role: "editor" },
      { businessId: businessA, businessName: "Riverside Plumbing", role: "owner" },
    ]);
  });

  it("breaks ties between memberships created at the same moment by business id", async () => {
    const created = await dbs.staff.db
      .insert(businesses)
      .values([
        { slug: "alpha-co", name: "Alpha Co" },
        { slug: "beta-co", name: "Beta Co" },
      ])
      .returning({ id: businesses.id, name: businesses.name });
    const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const sameMoment = new Date("2021-06-01T12:00:00Z");
    await dbs.staff.db.insert(users).values({ id: "user-c", name: "Cy", email: "cy@example.com" });
    // Insert in descending id order, so only the tiebreaker can produce ascending order.
    for (const business of [...created].sort(byId).reverse()) {
      await dbs.staff.db
        .insert(businessMembers)
        .values({ businessId: business.id, userId: "user-c", role: "owner", createdAt: sameMoment });
    }

    expect(await listMembershipsForUser(dbs.app.db, "user-c")).toEqual(
      [...created].sort(byId).map((business) => ({ businessId: business.id, businessName: business.name, role: "owner" })),
    );
  });

  it("returns an empty list for a user with no business", async () => {
    await dbs.staff.db.insert(users).values({ id: "user-c", name: "Cy", email: "cy@example.com" });
    expect(await listMembershipsForUser(dbs.app.db, "user-c")).toEqual([]);
  });
});

describe("staff queries", () => {
  it("finds active staff and ignores inactive staff", async () => {
    await dbs.staff.db.insert(staffMembers).values([
      { userId: USER_A },
      { userId: USER_B, active: false },
    ]);

    expect(await findActiveStaffMember(dbs.staff.db, USER_A)).toEqual({ userId: USER_A, role: "admin" });
    expect(await findActiveStaffMember(dbs.staff.db, USER_B)).toBeNull();
    expect(await findActiveStaffMember(dbs.staff.db, "nobody")).toBeNull();
  });

  it("counts businesses across all tenants", async () => {
    expect(await countPlatformRecords(dbs.staff.db)).toEqual({ businesses: 2 });
  });
});
