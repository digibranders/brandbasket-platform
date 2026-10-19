import { users } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withAccountCreationGrant } from "./account-creation-grant";
import { createAuth, PASSWORD_MIN_LENGTH, type AccountMail, type Auth } from "./create-auth";
import { isAuthApiError, isInvalidCredentialsError, isInvalidTokenError } from "./errors";

const ORIGIN = "http://app.localhost:3000";
const OWNER = { email: "owner@example.com", name: "Riley Owner", password: "correct-horse-battery-9" };

let dbs: TestDatabases;
let auth: Auth;

async function userCount(): Promise<number> {
  const rows = await dbs.staff.db.select({ value: count() }).from(users);
  return rows[0]?.value ?? 0;
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected the operation to fail, but it succeeded.");
    },
    (error: unknown) => error,
  );
}

function expectApiErrorCode(error: unknown, code: string): void {
  expect(isAuthApiError(error)).toBe(true);
  expect(isAuthApiError(error) ? error.body?.code : undefined).toBe(code);
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

describe("account creation grant", () => {
  it("is refused without a grant", async () => {
    const failure = await captureFailure(auth.api.signUpEmail({ body: OWNER }));
    expectApiErrorCode(failure, "FAILED_TO_CREATE_USER");
    expect(await userCount()).toBe(0);
  });

  it("is refused when the grant names another email", async () => {
    const failure = await captureFailure(
      withAccountCreationGrant("someone-else@example.com", () => auth.api.signUpEmail({ body: OWNER })),
    );
    expectApiErrorCode(failure, "FAILED_TO_CREATE_USER");
    expect(await userCount()).toBe(0);
  });

  it("succeeds inside a matching grant", async () => {
    const result = await withAccountCreationGrant(OWNER.email, () => auth.api.signUpEmail({ body: OWNER }));

    expect(result.user.email).toBe(OWNER.email);
    expect(await userCount()).toBe(1);
  });
});

describe("password policy", () => {
  async function signUpFailure(password: string): Promise<unknown> {
    const account = { email: "weak-password@example.com", name: "Weak Pw", password };
    return captureFailure(withAccountCreationGrant(account.email, () => auth.api.signUpEmail({ body: account })));
  }

  it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH} characters`, async () => {
    const failure = await signUpFailure("ab1!efg");
    expect("ab1!efg".length).toBeLessThan(PASSWORD_MIN_LENGTH);
    expectApiErrorCode(failure, "WEAK_PASSWORD");
    expect(await userCount()).toBe(0);
  });

  it("rejects a password missing a letter, a number or a symbol, and says which", async () => {
    for (const [password, message] of [
      ["12345678!", "Add at least one letter."],
      ["abcdefgh!", "Add at least one number."],
      ["abcdefgh1", "Add at least one symbol, such as ! # or @."],
    ] as const) {
      const failure = await signUpFailure(password);
      expectApiErrorCode(failure, "WEAK_PASSWORD");
      expect(isAuthApiError(failure) ? failure.body?.message : undefined).toBe(message);
    }
    expect(await userCount()).toBe(0);
  });

  it("accepts 8 characters with a letter, a number and a symbol", async () => {
    const account = { email: "strong-password@example.com", name: "Strong Pw", password: "abcdef1!" };
    await withAccountCreationGrant(account.email, () => auth.api.signUpEmail({ body: account }));
    expect(await userCount()).toBe(1);
  });

  it("leaves signing in alone: a weak guess is just wrong credentials", async () => {
    const failure = await captureFailure(auth.api.signInEmail({ body: { email: "nobody@example.com", password: "short" } }));
    expect(isInvalidCredentialsError(failure)).toBe(true);
  });

  it("rejects a weak new password on change, and keeps the old one", async () => {
    await withAccountCreationGrant(OWNER.email, () => auth.api.signUpEmail({ body: OWNER }));
    const signedIn = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password }, returnHeaders: true });
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";

    const failure = await captureFailure(
      auth.api.changePassword({
        body: { currentPassword: OWNER.password, newPassword: "no-digits-here!" },
        headers: new Headers({ cookie }),
      }),
    );

    expectApiErrorCode(failure, "WEAK_PASSWORD");
    const again = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password } });
    expect(again.user.email).toBe(OWNER.email);
  });
});

describe("sign in", () => {
  beforeEach(async () => {
    await withAccountCreationGrant(OWNER.email, () => auth.api.signUpEmail({ body: OWNER }));
  });

  it("accepts the right password", async () => {
    const result = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password } });
    expect(result.user.email).toBe(OWNER.email);
  });

  it("accepts a mixed-case email", async () => {
    // Better Auth's sign-in route lowercases the email before matching but never trims it, so only
    // case (not surrounding whitespace) can vary here.
    const result = await auth.api.signInEmail({
      body: { email: "Owner@Example.com", password: OWNER.password },
    });
    expect(result.user.email).toBe(OWNER.email);
  });

  it("rejects a wrong password with the invalid-credentials code", async () => {
    const failure = await captureFailure(
      auth.api.signInEmail({ body: { email: OWNER.email, password: "wrong-password-123" } }),
    );
    expectApiErrorCode(failure, "INVALID_EMAIL_OR_PASSWORD");
    expect(isInvalidCredentialsError(failure)).toBe(true);
  });

  it("rejects an unknown email with the same code as a wrong password", async () => {
    const failure = await captureFailure(
      auth.api.signInEmail({ body: { email: "nobody@example.com", password: OWNER.password } }),
    );
    expectApiErrorCode(failure, "INVALID_EMAIL_OR_PASSWORD");
    expect(isInvalidCredentialsError(failure)).toBe(true);
  });

  it("round-trips a session: sign in sets a cookie, getSession sees it, signOut clears it", async () => {
    const signInResult = await auth.api.signInEmail({
      body: { email: OWNER.email, password: OWNER.password },
      returnHeaders: true,
    });
    const setCookie = signInResult.headers.get("set-cookie");
    if (!setCookie) throw new Error("Expected sign-in to set a session cookie.");
    const cookiePair = setCookie.split(";")[0];
    if (!cookiePair) throw new Error("Expected a non-empty session cookie pair.");

    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookiePair }) });
    expect(session?.user.email).toBe(OWNER.email);

    await auth.api.signOut({ headers: new Headers({ cookie: cookiePair }) });

    const afterSignOut = await auth.api.getSession({ headers: new Headers({ cookie: cookiePair }) });
    expect(afterSignOut).toBeNull();
  });
});

describe("password reset and email confirmation", () => {
  const SECRET = "integration-test-secret-with-at-least-32-chars";
  const NEW_PASSWORD = "a-brand-new-password-7";
  let resets: AccountMail[];
  let confirmations: AccountMail[];
  let mailing: Auth;

  function sessionCookie(headers: Headers): string {
    const pair = headers.get("set-cookie")?.split(";")[0];
    if (!pair) throw new Error("Expected sign-in to set a session cookie.");
    return pair;
  }

  async function emailConfirmed(): Promise<boolean | undefined> {
    const rows = await dbs.staff.db.select({ emailVerified: users.emailVerified }).from(users).where(eq(users.email, OWNER.email));
    return rows[0]?.emailVerified;
  }

  beforeEach(async () => {
    resets = [];
    confirmations = [];
    mailing = createAuth({
      db: dbs.app.db,
      secret: SECRET,
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      nextCookies: false,
      mailer: {
        sendPasswordReset: async (mail) => void resets.push(mail),
        sendEmailConfirmation: async (mail) => void confirmations.push(mail),
      },
    });
    await withAccountCreationGrant(OWNER.email, () => mailing.api.signUpEmail({ body: OWNER }));
  });

  it("sends no confirmation on sign-up: the app asks for one when it wants it", () => {
    expect(confirmations).toEqual([]);
  });

  it("emails a one-time reset token for an account, and none for an address with no account", async () => {
    await mailing.api.requestPasswordReset({ body: { email: "nobody@example.com" } });
    expect(resets).toEqual([]);

    await mailing.api.requestPasswordReset({ body: { email: OWNER.email } });
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({ email: OWNER.email, name: OWNER.name });
    expect(resets[0]?.token).toMatch(/^[A-Za-z0-9]{20,}$/);
  });

  it("sets the new password once, ends every session, and refuses the token a second time", async () => {
    const signedIn = await mailing.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password }, returnHeaders: true });
    const cookie = sessionCookie(signedIn.headers);
    await mailing.api.requestPasswordReset({ body: { email: OWNER.email } });
    const token = resets[0]?.token ?? "";

    await mailing.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } });

    expect(await mailing.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    const oldPassword = await captureFailure(mailing.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password } }));
    expect(isInvalidCredentialsError(oldPassword)).toBe(true);
    const fresh = await mailing.api.signInEmail({ body: { email: OWNER.email, password: NEW_PASSWORD } });
    expect(fresh.user.email).toBe(OWNER.email);

    const reused = await captureFailure(mailing.api.resetPassword({ body: { token, newPassword: "yet-another-password-8" } }));
    expect(isInvalidTokenError(reused)).toBe(true);
  });

  it("refuses a weak new password on reset, and leaves the token usable", async () => {
    await mailing.api.requestPasswordReset({ body: { email: OWNER.email } });
    const token = resets[0]?.token ?? "";

    const weak = await captureFailure(mailing.api.resetPassword({ body: { token, newPassword: "abcdefgh!" } }));
    expectApiErrorCode(weak, "WEAK_PASSWORD");

    await mailing.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } });
    const fresh = await mailing.api.signInEmail({ body: { email: OWNER.email, password: NEW_PASSWORD } });
    expect(fresh.user.email).toBe(OWNER.email);
  });

  it("refuses a reset token that was never issued", async () => {
    const failure = await captureFailure(mailing.api.resetPassword({ body: { token: "not-a-token", newPassword: NEW_PASSWORD } }));
    expect(isInvalidTokenError(failure)).toBe(true);
  });

  it("refuses to reset a password where no mailer is configured, rather than sending nothing", async () => {
    const failure = await captureFailure(auth.api.requestPasswordReset({ body: { email: OWNER.email } }));
    expectApiErrorCode(failure, "RESET_PASSWORD_DISABLED");
  });

  it("confirms the address from the emailed token, and refuses a token that is not one", async () => {
    expect(await emailConfirmed()).toBe(false);
    await mailing.api.sendVerificationEmail({ body: { email: OWNER.email } });
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]).toMatchObject({ email: OWNER.email });

    const bogus = await captureFailure(mailing.api.verifyEmail({ query: { token: "not.a.token" } }));
    expect(isInvalidTokenError(bogus)).toBe(true);
    expect(await emailConfirmed()).toBe(false);

    await mailing.api.verifyEmail({ query: { token: confirmations[0]?.token ?? "" } });
    expect(await emailConfirmed()).toBe(true);
    // Opening the link again is harmless.
    await mailing.api.verifyEmail({ query: { token: confirmations[0]?.token ?? "" } });
    expect(await emailConfirmed()).toBe(true);
  });
});
