import { accountOtps, rateLimitBuckets, sessions, staffMembers, users } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAccountWithGrant } from "./create-account";
import { createAuth, type Auth } from "./create-auth";
import { resetStaffSignIn, StaffRecoveryError } from "./staff-recovery";
import { issueStaffSignInCode, verifyStaffSignInCode, type IssueStaffSignInCodeOutcome } from "./staff-sign-in-code";
import { verifyCredentials } from "./staff-second-factor";

const ORIGIN = "http://console.localhost:3000";
const SECRET = "integration-test-secret-with-at-least-32-chars";
const STAFF = { email: "asha@brandbasket.test", name: "Asha Rao", password: "correct-horse-battery-9" };
const IP = "203.0.113.7";

let dbs: TestDatabases;
let auth: Auth;
let userId: string;

type Issued = Extract<IssueStaffSignInCodeOutcome, { kind: "issued" }>;

async function issue(now = new Date(), email = STAFF.email): Promise<Issued> {
  const outcome = await issueStaffSignInCode(dbs.staff.db, { email, clientIp: IP, secret: SECRET, now });
  if (outcome.kind !== "issued") throw new Error("expected a code to be issued");
  return outcome;
}

function verify(otpId: string, code: string, now = new Date()) {
  return verifyStaffSignInCode(dbs.staff.db, { otpId, code, clientIp: IP, secret: SECRET, now, acceptAnySixDigits: false });
}

/** A six-digit code that is not `code`. */
function otherThan(code: string): string {
  return code === "000000" ? "000001" : "000000";
}

async function sessionCount(): Promise<number> {
  return (await dbs.staff.db.select({ id: sessions.id }).from(sessions)).length;
}

/** Starts a console session the way the app does, and returns what a browser would send back. */
async function completeSignIn(): Promise<Headers> {
  const { headers } = await auth.api.completeStaffSignIn({ body: { userId }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

beforeAll(() => {
  dbs = openTestDatabases();
  auth = createAuth({ db: dbs.staff.db, secret: SECRET, baseURL: ORIGIN, trustedOrigins: [ORIGIN], nextCookies: false });
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  userId = (await createAccountWithGrant(auth, dbs.staff.db, STAFF)).userId;
  await dbs.staff.db.insert(staffMembers).values({ userId, role: "support" });
});

describe("the first factor", () => {
  it("accepts the right password without starting a session", async () => {
    expect(await verifyCredentials(auth, STAFF.email, STAFF.password)).toEqual({ userId, email: STAFF.email });
    expect(await sessionCount()).toBe(0);
  });

  it("answers null for a wrong password, an unknown address and an account with no password", async () => {
    expect(await verifyCredentials(auth, STAFF.email, "wrong-horse-battery-9")).toBeNull();
    expect(await verifyCredentials(auth, "nobody@brandbasket.test", STAFF.password)).toBeNull();
    await dbs.owner.db.update(users).set({ email: "nopass@brandbasket.test" }).where(eq(users.id, userId));
    await dbs.owner.db.execute(`update accounts set password = null where user_id = '${userId}'`);
    expect(await verifyCredentials(auth, "nopass@brandbasket.test", STAFF.password)).toBeNull();
    expect(await sessionCount()).toBe(0);
  });
});

describe("the emailed code", () => {
  it("is stored only as a hash, for five minutes", async () => {
    const now = new Date();
    const { code, otpId } = await issue(now);
    const [row] = await dbs.owner.db.select().from(accountOtps).where(eq(accountOtps.id, otpId));
    expect(row?.purpose).toBe("staff_sign_in");
    expect(row?.email).toBe(STAFF.email);
    expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.codeHash).not.toContain(code);
    expect(row?.expiresAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("finishes the sign-in once, and the session it starts is marked as having passed the code", async () => {
    const { code, otpId } = await issue();
    expect(await verify(otpId, code)).toEqual({ kind: "verified", email: STAFF.email });

    const cookies = await completeSignIn();
    const session = await auth.api.getSession({ headers: cookies });
    expect(session?.user.id).toBe(userId);
    expect(session?.session.secondFactorAt).toBeInstanceOf(Date);
  });

  it("is refused the second time it is used", async () => {
    const { code, otpId } = await issue();
    expect((await verify(otpId, code)).kind).toBe("verified");
    expect(await verify(otpId, code)).toEqual({ kind: "expired", email: null });
  });

  it("is refused once it has expired, even when it is right", async () => {
    const { code, otpId } = await issue(new Date(Date.now() - 6 * 60 * 1000));
    expect(await verify(otpId, code)).toEqual({ kind: "expired", email: null });
  });

  it("counts wrong codes, and the fifth ends the code even for the right one", async () => {
    const { code, otpId } = await issue();
    const wrong = otherThan(code);
    expect(await verify(otpId, wrong)).toEqual({ kind: "wrong_code", triesLeft: 4, email: STAFF.email });
    expect(await verify(otpId, wrong)).toMatchObject({ kind: "wrong_code", triesLeft: 3 });
    await verify(otpId, wrong);
    await verify(otpId, wrong);
    expect(await verify(otpId, wrong)).toEqual({ kind: "expired", email: STAFF.email });
    expect(await verify(otpId, code)).toEqual({ kind: "expired", email: null });
  });

  it("does not cost a try to enter something that is not six digits", async () => {
    const { code, otpId } = await issue();
    expect(await verify(otpId, "12ab")).toEqual({ kind: "wrong_code", triesLeft: null, email: null });
    expect((await verify(otpId, code)).kind).toBe("verified");
  });

  it("is not accepted from another code, and a new code leaves the old one working until it runs out", async () => {
    const first = await issue();
    const second = await issue();
    expect((await verify(second.otpId, otherThan(second.code))).kind).toBe("wrong_code");
    expect((await verify(first.otpId, first.code)).kind).toBe("verified");
  });

  it("cannot be checked with an id that is not a code's", async () => {
    expect(await verify("not-an-id", "123456")).toEqual({ kind: "expired", email: null });
  });

  it("accepts any six digits only when the local bypass is asked for, and still spends the code", async () => {
    const { code, otpId } = await issue();
    const outcome = await verifyStaffSignInCode(dbs.staff.db, { otpId, code: otherThan(code), clientIp: IP, secret: SECRET, now: new Date(), acceptAnySixDigits: true });
    expect(outcome.kind).toBe("verified");
    expect((await verify(otpId, code)).kind).toBe("expired");
  });
});

describe("rate limits", () => {
  it("limits codes per address to three in ten minutes", async () => {
    const now = new Date();
    await issue(now);
    await issue(now);
    await issue(now);
    const fourth = await issueStaffSignInCode(dbs.staff.db, { email: STAFF.email, clientIp: IP, secret: SECRET, now });
    expect(fourth.kind).toBe("limited");
    expect(fourth.kind === "limited" && fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("limits checks per network, whatever the codes", async () => {
    const now = new Date();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await verify("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", "123456", now)).kind).toBe("expired");
    }
    expect((await verify("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", "123456", now)).kind).toBe("limited");
  });
});

describe("the session", () => {
  it("is not started by Better Auth's own password sign-in with the second-factor mark", async () => {
    await auth.api.signInEmail({ body: { email: STAFF.email, password: STAFF.password } });
    const [row] = await dbs.owner.db.select().from(sessions);
    expect(row?.secondFactorAt).toBeNull();
  });

  it("cannot be started over HTTP: the endpoint is server-only", async () => {
    // Control: the router answers at this base path, so the 404 below is about the endpoint.
    expect((await auth.handler(new Request(`${ORIGIN}/api/auth/ok`))).status).toBe(200);
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/staff/complete-sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ userId }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await sessionCount()).toBe(0);
  });

  it("is refused for an account that does not exist", async () => {
    await expect(auth.api.completeStaffSignIn({ body: { userId: "no-such-user" } })).rejects.toMatchObject({ body: { code: "UNKNOWN_USER" } });
    expect(await sessionCount()).toBe(0);
  });
});

describe("recovery", () => {
  it("ends sessions, removes unused codes and lifts the code limits", async () => {
    const now = new Date();
    await issue(now);
    await issue(now);
    await issue(now);
    await completeSignIn();
    await dbs.staff.db.insert(rateLimitBuckets).values({ key: "unrelated", windowStart: now, count: 1 });

    const result = await resetStaffSignIn(dbs.staff.db, { email: ` ${STAFF.email.toUpperCase()} ` });
    expect(result).toMatchObject({ userId, email: STAFF.email, sessionsEnded: 1, codesRemoved: 3 });
    expect(await sessionCount()).toBe(0);
    expect((await issueStaffSignInCode(dbs.staff.db, { email: STAFF.email, clientIp: IP, secret: SECRET, now })).kind).toBe("issued");
    expect((await dbs.staff.db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, "unrelated"))).length).toBe(1);
  });

  it("moves the account to a new address, so the next code goes there, and leaves the password alone", async () => {
    await resetStaffSignIn(dbs.staff.db, { email: STAFF.email, newEmail: "Asha.New@brandbasket.test" });
    expect(await verifyCredentials(auth, STAFF.email, STAFF.password)).toBeNull();
    expect(await verifyCredentials(auth, "asha.new@brandbasket.test", STAFF.password)).toEqual({ userId, email: "asha.new@brandbasket.test" });
  });

  it("refuses an address that is not staff, a taken new address and a bad one", async () => {
    await createAccountWithGrant(auth, dbs.staff.db, { email: "customer@example.test", name: "Customer", password: STAFF.password });
    await expect(resetStaffSignIn(dbs.staff.db, { email: "customer@example.test" })).rejects.toThrow(StaffRecoveryError);
    await expect(resetStaffSignIn(dbs.staff.db, { email: STAFF.email, newEmail: "customer@example.test" })).rejects.toThrow("already belongs");
    await expect(resetStaffSignIn(dbs.staff.db, { email: STAFF.email, newEmail: "nope" })).rejects.toThrow("--new-email");
    await expect(resetStaffSignIn(dbs.staff.db, { email: "nope" })).rejects.toThrow("--email");
  });
});
