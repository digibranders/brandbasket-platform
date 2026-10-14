import { findUserByPhone, sessions, users } from "@fynix/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@fynix/db/testing";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountAlreadyExistsError } from "./create-account";
import { createAuth, type Auth } from "./create-auth";
import { isInvalidCredentialsError } from "./errors";
import { createPhoneAccountWithGrant, setAccountPassword } from "./phone-account";

const ORIGIN = "http://app.localhost:3000";
const OWNER = { phone: "+919820011223", name: "Asha Owner", password: "correct-horse-battery" };
const PLACEHOLDER = "919820011223@phone.fynix.invalid";

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

describe("createPhoneAccountWithGrant", () => {
  it("opens an account that signs in by its number, already proven, under a placeholder address", async () => {
    const created = await createPhoneAccountWithGrant(auth, dbs.app.db, OWNER);
    expect(created).toEqual({ userId: created.userId, email: PLACEHOLDER });

    const rows = await dbs.staff.db.select().from(users).where(eq(users.id, created.userId));
    expect(rows[0]).toMatchObject({ name: "Asha Owner", email: PLACEHOLDER, emailVerified: false, phoneNumber: OWNER.phone, phoneNumberVerified: true });
    expect(await findUserByPhone(dbs.app.db, OWNER.phone)).toMatchObject({ id: created.userId });

    const signedIn = await auth.api.signInEmail({ body: { email: PLACEHOLDER, password: OWNER.password } });
    expect(signedIn.user.id).toBe(created.userId);
  });

  it("gives the session the number, so pages can show it", async () => {
    await createPhoneAccountWithGrant(auth, dbs.app.db, OWNER);
    const signedIn = await auth.api.signInEmail({ body: { email: PLACEHOLDER, password: OWNER.password }, returnHeaders: true });
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ phoneNumber: OWNER.phone, phoneNumberVerified: true });
  });

  it("refuses a number that already has an account, and leaves one row", async () => {
    await createPhoneAccountWithGrant(auth, dbs.app.db, OWNER);
    await expect(createPhoneAccountWithGrant(auth, dbs.app.db, { ...OWNER, name: "Someone Else" })).rejects.toThrow(AccountAlreadyExistsError);
    const total = await dbs.staff.db.select({ value: count() }).from(users);
    expect(total[0]?.value).toBe(1);
  });
});

describe("setAccountPassword", () => {
  it("replaces the password and ends every session of the account", async () => {
    const created = await createPhoneAccountWithGrant(auth, dbs.app.db, OWNER);
    await auth.api.signInEmail({ body: { email: PLACEHOLDER, password: OWNER.password } });
    expect((await dbs.staff.db.select({ value: count() }).from(sessions))[0]?.value).toBe(1);

    await setAccountPassword(auth, created.userId, "a-brand-new-password");

    expect((await dbs.staff.db.select({ value: count() }).from(sessions))[0]?.value).toBe(0);
    const old = await auth.api.signInEmail({ body: { email: PLACEHOLDER, password: OWNER.password } }).catch((error: unknown) => error);
    expect(isInvalidCredentialsError(old)).toBe(true);
    const fresh = await auth.api.signInEmail({ body: { email: PLACEHOLDER, password: "a-brand-new-password" } });
    expect(fresh.user.id).toBe(created.userId);
  });

  it("refuses a password shorter than the policy allows", async () => {
    const created = await createPhoneAccountWithGrant(auth, dbs.app.db, OWNER);
    await expect(setAccountPassword(auth, created.userId, "short")).rejects.toThrow(RangeError);
  });
});
