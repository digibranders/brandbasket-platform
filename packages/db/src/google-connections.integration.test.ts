import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findGoogleConnection, listGoogleConnections, markGoogleConnectionLost, markGoogleConnectionOk, saveGoogleConnection } from "./queries/google-connections";
import { googleConnections, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "gc-staff";
const NOW = new Date("2026-11-03T04:00:00.000Z");
const LATER = new Date("2026-11-04T04:00:00.000Z");

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: STAFF, email: `${STAFF}@example.com`, emailVerified: true });
});

const staff = () => dbs.staff.db;
const sign = (purpose: "read" | "write", token: string, now = NOW) =>
  saveGoogleConnection(staff(), { slot: 1, purpose, accountEmail: "official.brandbasket@gmail.com", scopes: ["a", "b"], sealedRefreshToken: token, staffUserId: STAFF, now });

async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

describe("google_connections (migration 0220)", () => {
  it("keeps one row per slot and purpose, replacing the sealed token on reconnect", async () => {
    await sign("read", "sealed-1");
    await sign("write", "sealed-w");
    await sign("read", "sealed-2", LATER);
    const rows = await listGoogleConnections(staff());
    expect(rows.map((row) => [row.slot, row.purpose, row.sealedRefreshToken, row.status])).toEqual([
      [1, "read", "sealed-2", "connected"],
      [1, "write", "sealed-w", "connected"],
    ]);
    expect((await findGoogleConnection(staff(), 1, "read"))?.lastOkAt).toEqual(LATER);
    expect(await findGoogleConnection(staff(), 2, "read")).toBeNull();
  });

  it("reports a lost sign-in once, and a reconnect makes it connected again", async () => {
    await sign("read", "sealed-1");
    expect(await markGoogleConnectionLost(staff(), 1, "read", "invalid_grant", NOW)).toBe(true);
    expect(await markGoogleConnectionLost(staff(), 1, "read", "invalid_grant", LATER)).toBe(false);
    expect((await findGoogleConnection(staff(), 1, "read"))?.status).toBe("access_lost");
    await sign("read", "sealed-3", LATER);
    const row = await findGoogleConnection(staff(), 1, "read");
    expect([row?.status, row?.lastError]).toEqual(["connected", null]);
    await markGoogleConnectionOk(staff(), 1, "read", NOW);
    expect((await findGoogleConnection(staff(), 1, "read"))?.lastOkAt).toEqual(NOW);
  });

  it("refuses an unknown purpose or status and an overlong error", async () => {
    await sign("read", "sealed-1");
    expect(await sqlState(() => staff().execute(sql`update google_connections set purpose = 'admin'`))).toBe("23514");
    expect(await sqlState(() => staff().execute(sql`update google_connections set status = 'gone'`))).toBe("23514");
    expect(await sqlState(() => staff().execute(sql`update google_connections set last_error = ${"x".repeat(301)}`))).toBe("23514");
  });

  it("gives the customer and public roles no way in", async () => {
    await sign("read", "sealed-1");
    for (const handle of [dbs.app, dbs.publicRole]) {
      expect(await sqlState(() => handle.db.select().from(googleConnections))).toBe("42501");
      expect(await sqlState(() => handle.db.execute(sql`delete from google_connections`))).toBe("42501");
    }
  });
});
