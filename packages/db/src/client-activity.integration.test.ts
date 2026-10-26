import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { setupCallBookings, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const STAFF = "staff-a";

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Meera Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
  ]);
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"))).id;
  await dbs.staff.db.insert(setupCallBookings).values({ businessId });
});

/** Postgres reports a missing privilege as SQLSTATE 42501; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code;
  }
}

describe("who may mark a kickoff call as held", () => {
  it("lets staff mark it", async () => {
    await dbs.staff.db
      .update(setupCallBookings)
      .set({ heldAt: new Date("2026-10-26T06:00:00.000Z"), heldByStaffId: STAFF })
      .where(eq(setupCallBookings.businessId, businessId));
    const [row] = await dbs.staff.db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    expect(row?.heldByStaffId).toBe(STAFF);
  });

  it("the customer role cannot mark its own call held", async () => {
    const state = await sqlState(() =>
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.execute(sql`update setup_call_bookings set held_at = now() where business_id = ${businessId}`),
      ),
    );
    expect(state).toBe("42501");
  });

  it("the customer role cannot insert a booking that is already held", async () => {
    await dbs.staff.db.delete(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    const state = await sqlState(() =>
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.execute(sql`insert into setup_call_bookings (id, business_id, held_by_staff_id) values (gen_random_uuid(), ${businessId}, ${STAFF})`),
      ),
    );
    expect(state).toBe("42501");
  });

  it("the customer role can still change the booking's own columns", async () => {
    await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
      tx.execute(sql`update setup_call_bookings set invitee_uri = 'https://api.cal.com/v2/bookings/x', updated_at = now() where business_id = ${businessId}`),
    );
    const [row] = await dbs.staff.db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    expect(row?.inviteeUri).toBe("https://api.cal.com/v2/bookings/x");
  });
});
