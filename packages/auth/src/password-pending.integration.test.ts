import { users } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountWithGrant } from "./create-account";
import { createAuth, type AccountMail, type Auth } from "./create-auth";
import { isInvalidTokenError } from "./errors";
import { createPendingPasswordAccountWithGrant } from "./pending-password-account";

const ORIGIN = "http://app.localhost:3000";
const SECRET = "integration-test-secret-with-at-least-32-chars";
const OWNER = { email: "owner@example.com", name: "Riley Owner", password: "correct-horse-battery-9" };
const NEW_PASSWORD = "a-brand-new-password-7!";
const HOUR_MS = 60 * 60 * 1000;

let dbs: TestDatabases;
let mails: AccountMail[];

function authWith(resetPasswordLifetimeSeconds?: number): Auth {
  return createAuth({
    db: dbs.app.db,
    secret: SECRET,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    nextCookies: false,
    mailer: {
      sendPasswordReset: async (mail) => {
        mails.push(mail);
      },
    },
    ...(resetPasswordLifetimeSeconds === undefined ? {} : { resetPasswordLifetimeSeconds }),
  });
}

/** Asks for a reset link the way the app does and returns the token its email would carry. */
async function requestResetToken(auth: Auth, email: string): Promise<string> {
  mails = [];
  await auth.api.requestPasswordReset({ body: { email } });
  const mail = mails[0];
  if (mail === undefined) throw new Error("The reset request sent no email.");
  return mail.token;
}

async function readUser(userId: string): Promise<{ passwordPending: boolean; emailVerified: boolean }> {
  const rows = await dbs.staff.db
    .select({ passwordPending: users.passwordPending, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));
  const row = rows[0];
  if (row === undefined) throw new Error(`No user ${userId}.`);
  return row;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  mails = [];
  await resetTestDatabase(dbs.owner);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPendingPasswordAccountWithGrant", () => {
  it("leaves the account pending and unverified", async () => {
    const auth = authWith();
    const created = await createPendingPasswordAccountWithGrant(auth, dbs.app.db, OWNER);

    expect(created.email).toBe(OWNER.email);
    expect(await readUser(created.userId)).toEqual({ passwordPending: true, emailVerified: false });
  });

  it("leaves an account made by createAccountWithGrant not pending", async () => {
    const auth = authWith();
    const created = await createAccountWithGrant(auth, dbs.app.db, OWNER);

    expect(await readUser(created.userId)).toEqual({ passwordPending: false, emailVerified: false });
  });
});

describe("a password reset", () => {
  it("on a pending account clears the marker, confirms the email and lets the owner sign in with the new password", async () => {
    const auth = authWith();
    const created = await createPendingPasswordAccountWithGrant(auth, dbs.app.db, OWNER);
    const token = await requestResetToken(auth, OWNER.email);

    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(await readUser(created.userId)).toEqual({ passwordPending: false, emailVerified: true });
    const signedIn = await auth.api.signInEmail({ body: { email: OWNER.email, password: NEW_PASSWORD } });
    expect(signedIn.user.id).toBe(created.userId);
  });

  it("on a normal account with an unconfirmed email leaves the email unconfirmed and the marker off", async () => {
    const auth = authWith();
    const created = await createAccountWithGrant(auth, dbs.app.db, OWNER);
    const token = await requestResetToken(auth, OWNER.email);

    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(await readUser(created.userId)).toEqual({ passwordPending: false, emailVerified: false });
  });

  it("on a normal account with a confirmed email keeps it confirmed and the marker off", async () => {
    const auth = authWith();
    const created = await createAccountWithGrant(auth, dbs.app.db, OWNER);
    await dbs.owner.db.update(users).set({ emailVerified: true }).where(eq(users.id, created.userId));
    const token = await requestResetToken(auth, OWNER.email);

    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(await readUser(created.userId)).toEqual({ passwordPending: false, emailVerified: true });
  });
});

describe("the reset link lifetime", () => {
  it("lets a 3 day link made by one instance be used after 2 hours on an instance with the default lifetime", async () => {
    const created = await createPendingPasswordAccountWithGrant(authWith(), dbs.app.db, OWNER);
    const token = await requestResetToken(authWith(3 * 24 * 3600), OWNER.email);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    await authWith().api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(await readUser(created.userId)).toEqual({ passwordPending: false, emailVerified: true });
  });

  it("refuses a default lifetime link after 2 hours", async () => {
    const auth = authWith();
    const created = await createPendingPasswordAccountWithGrant(auth, dbs.app.db, OWNER);
    const token = await requestResetToken(auth, OWNER.email);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    const attempt = auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    await expect(attempt).rejects.toSatisfy(isInvalidTokenError);
    expect(await readUser(created.userId)).toEqual({ passwordPending: true, emailVerified: false });
  });
});
