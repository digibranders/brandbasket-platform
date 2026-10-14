import { users } from "@fynix/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@fynix/db/testing";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountAlreadyExistsError, createAccountWithGrant } from "./create-account";
import { createAuth, type Auth } from "./create-auth";

const ORIGIN = "http://app.localhost:3000";
const OWNER = { email: "owner@example.com", name: "Riley Owner", password: "correct-horse-battery" };

let dbs: TestDatabases;
let auth: Auth;

async function userCount(): Promise<number> {
  const rows = await dbs.staff.db.select({ value: count() }).from(users);
  return rows[0]?.value ?? 0;
}

beforeAll(() => {
  dbs = openTestDatabases();
  auth = createAuth({
    db: dbs.app.db,
    secret: "integration-test-secret-with-at-least-32-chars",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    nextCookies: false,
  });
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("createAccountWithGrant", () => {
  it("creates a user and returns an id that exists in the users table", async () => {
    const created = await createAccountWithGrant(auth, dbs.app.db, OWNER);

    expect(created.email).toBe(OWNER.email);
    expect(created.userId.length).toBeGreaterThan(0);

    const rows = await dbs.staff.db.select({ id: users.id }).from(users).where(eq(users.id, created.userId));
    expect(rows).toHaveLength(1);
  });

  it("normalises a mixed-case, padded email and that account can then sign in", async () => {
    const created = await createAccountWithGrant(auth, dbs.app.db, { ...OWNER, email: " Owner@Example.com " });
    expect(created.email).toBe(OWNER.email);

    const signedIn = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password } });
    expect(signedIn.user.id).toBe(created.userId);
  });

  it("refuses an address in the placeholder domain, which only a phone account may hold", async () => {
    await expect(createAccountWithGrant(auth, dbs.app.db, { ...OWNER, email: "919820011223@phone.fynix.invalid" })).rejects.toThrow(
      RangeError,
    );
    expect(await userCount()).toBe(0);
  });

  it("throws AccountAlreadyExistsError for a duplicate email and leaves exactly one row", async () => {
    await createAccountWithGrant(auth, dbs.app.db, OWNER);

    await expect(createAccountWithGrant(auth, dbs.app.db, OWNER)).rejects.toThrow(AccountAlreadyExistsError);
    expect(await userCount()).toBe(1);
  });
});
