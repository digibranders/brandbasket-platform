import { users } from "@fynix/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@fynix/db/testing";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountAlreadyExistsError } from "./create-account";
import { createAuth, type Auth } from "./create-auth";
import { createVerifiedEmailAccountWithGrant } from "./email-account";
import { isInvalidCredentialsError } from "./errors";

const ORIGIN = "http://app.localhost:3000";
const OWNER = { email: "  Asha@Example.TEST ", name: "Asha Owner", password: "correct-horse-battery" };

let dbs: TestDatabases;
let auth: Auth;

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

describe("createVerifiedEmailAccountWithGrant", () => {
  it("opens an account that signs in by its email, stored lowercase and already proven, with no phone number", async () => {
    const created = await createVerifiedEmailAccountWithGrant(auth, dbs.app.db, OWNER);
    expect(created).toEqual({ userId: created.userId, email: "asha@example.test" });

    const rows = await dbs.staff.db.select().from(users).where(eq(users.id, created.userId));
    expect(rows[0]).toMatchObject({ name: "Asha Owner", email: "asha@example.test", emailVerified: true, phoneNumber: null });

    const signedIn = await auth.api.signInEmail({ body: { email: "asha@example.test", password: OWNER.password } });
    expect(signedIn.user.id).toBe(created.userId);
  });

  it("refuses an address that already has an account, and leaves one row", async () => {
    await createVerifiedEmailAccountWithGrant(auth, dbs.app.db, OWNER);
    await expect(createVerifiedEmailAccountWithGrant(auth, dbs.app.db, { ...OWNER, name: "Someone Else" })).rejects.toThrow(
      AccountAlreadyExistsError,
    );
    expect((await dbs.staff.db.select({ value: count() }).from(users))[0]?.value).toBe(1);
  });

  it("does not open the account with a different password than the one given", async () => {
    await createVerifiedEmailAccountWithGrant(auth, dbs.app.db, OWNER);
    const wrong = await auth.api.signInEmail({ body: { email: "asha@example.test", password: "not-the-password-at-all" } }).catch((error: unknown) => error);
    expect(isInvalidCredentialsError(wrong)).toBe(true);
  });
});
