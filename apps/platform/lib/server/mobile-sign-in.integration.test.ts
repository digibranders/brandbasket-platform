import { createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import { listRecentEmails, setUserPhoneNumber } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing in, and asking for a new password, with an email or with the mobile number given at sign-up: the real parsing,
 * the real lookup, Better Auth, the rate limits and the outbox on a real database. Only the request and the delivery after
 * the response are replaced.
 */

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null, ip: "203.0.113.7" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": state.ip, host: "app.brandbasket.localhost:3198" }),
}));
// Delivery after the response is replaced by nothing: the outbox copy is what these tests read.
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./db", () => ({
  getAppDb: () => open().app.db,
  getStaffDb: () => open().staff.db,
}));
vi.mock("./public-db", () => ({ getPublicDb: () => open().publicRole.db }));
vi.mock("./security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("./email", () => ({ realDeployment: () => false }));

import { requestPasswordReset, resetPassword } from "./account-recovery";
import { getAuth } from "./auth";
import { parseAccountIdentifier } from "./customer-sign-in-form";
import { signInWithPassword } from "./sign-in";

const EMAIL = "meera@example.test";
const PASSWORD = "correct-horse-battery-9";
const NEW_PASSWORD = "another-long-password-7";
const PHONE = "+919820011223";
/** What one person types for the number. */
const TYPED_NUMBERS = ["9820011223", " 98200 11223 ", "98200-11223", "+91 98200 11223", "+919820011223", "09820011223"];
const REAL_MESSAGE = "That number and password don’t match an account.";

function open(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

function form(identifier: string, password: string): FormData {
  const data = new FormData();
  data.set("identifier", identifier);
  data.set("password", password);
  return data;
}

function identifier(typed: string): Parameters<typeof requestPasswordReset>[0] {
  const parsed = parseAccountIdentifier(typed);
  if (!parsed.success) throw new Error(`Expected "${typed}" to be readable: ${parsed.message}`);
  return parsed.identifier;
}

async function openAccount(email: string, phone: string | null): Promise<string> {
  const { userId } = await createVerifiedEmailAccountWithGrant(getAuth(), open().staff.db, { email, name: "Meera Rao", password: PASSWORD });
  if (phone !== null && !(await setUserPhoneNumber(open().staff.db, userId, phone))) throw new Error("The number was taken.");
  return userId;
}

async function outbox(): Promise<readonly { readonly toAddress: string; readonly bodyText: string }[]> {
  return (await listRecentEmails(open().staff.db, 50)).filter((message) => message.template === "password-reset");
}

beforeAll(() => {
  state.dbs = openTestDatabases();
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  state.ip = "203.0.113.7";
  await resetTestDatabase(open().owner);
});

describe("signing in with an email or a mobile number", () => {
  it("signs in with the email", async () => {
    const userId = await openAccount(EMAIL, PHONE);
    expect(await signInWithPassword(form(" Meera@Example.test ", PASSWORD))).toEqual({ status: "signed-in", userId });
  });

  it.each(TYPED_NUMBERS)("signs in with the mobile number typed as %j, as the same account", async (typed) => {
    const userId = await openAccount(EMAIL, PHONE);
    expect(await signInWithPassword(form(typed, PASSWORD))).toEqual({ status: "signed-in", userId });
  });

  it("answers a wrong password, an unknown number and an unknown email alike, without saying which exist", async () => {
    await openAccount(EMAIL, PHONE);
    const wrongPassword = await signInWithPassword(form("98200 11223", "not-the-password-1"));
    const unknownNumber = await signInWithPassword(form("98765 43210", PASSWORD));
    expect(wrongPassword).toEqual({ status: "error", message: REAL_MESSAGE, email: "98200 11223" });
    expect(unknownNumber).toEqual({ status: "error", message: REAL_MESSAGE, email: "98765 43210" });

    const wrongEmailPassword = await signInWithPassword(form(EMAIL, "not-the-password-1"));
    const unknownEmail = await signInWithPassword(form("nobody@example.test", PASSWORD));
    expect(wrongEmailPassword).toEqual({ status: "error", message: "That email and password don’t match an account.", email: EMAIL });
    expect(unknownEmail).toMatchObject({ status: "error", message: "That email and password don’t match an account." });
  });

  it("does not sign an account in by a number it never gave, or by someone else's", async () => {
    await openAccount("older@example.test", null);
    await openAccount(EMAIL, PHONE);
    expect(await signInWithPassword(form("98200 11223", "wrong-password-1"))).toMatchObject({ status: "error", message: REAL_MESSAGE });
    expect(await signInWithPassword(form("older@example.test", PASSWORD))).toMatchObject({ status: "signed-in" });
  });

  it("refuses text that is neither, and the placeholder address, before looking anything up", async () => {
    expect(await signInWithPassword(form("hello", PASSWORD))).toEqual({ status: "error", message: "Enter a valid email address or mobile number.", email: "hello" });
    expect(await signInWithPassword(form("919820011223@phone.brandbasket.invalid", PASSWORD))).toMatchObject({ status: "error", message: "Enter a valid email address or mobile number." });
  });

  it("gives an account one guessing budget across its email and its number", async () => {
    await openAccount(EMAIL, PHONE);
    // 8 wrong guesses per account per network in 15 minutes: alternate between the two ways in.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const outcome = await signInWithPassword(form(attempt % 2 === 0 ? "98200 11223" : EMAIL, `wrong-guess-${attempt}-x`));
      expect(outcome).toMatchObject({ status: "error", message: expect.stringMatching(/don’t match/) });
    }
    expect(await signInWithPassword(form("98200 11223", PASSWORD))).toMatchObject({ status: "error", message: expect.stringMatching(/^Too many sign-in attempts/) });
    expect(await signInWithPassword(form(EMAIL, PASSWORD))).toMatchObject({ status: "error", message: expect.stringMatching(/^Too many sign-in attempts/) });
    // Another network is not held up by it.
    state.ip = "198.51.100.20";
    expect(await signInWithPassword(form("98200 11223", PASSWORD))).toMatchObject({ status: "signed-in" });
  });

  it("limits guesses at a number that has no account too", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) await signInWithPassword(form("98765 43210", `wrong-guess-${attempt}-x`));
    expect(await signInWithPassword(form("98765 43210", PASSWORD))).toMatchObject({ message: expect.stringMatching(/^Too many sign-in attempts/) });
  });
});

describe("asking for a new password with an email or a mobile number", () => {
  it("emails the link to the address on file when the email is given", async () => {
    await openAccount(EMAIL, PHONE);
    expect(await requestPasswordReset(identifier(EMAIL))).toBe("accepted");
    expect((await outbox()).map((row) => row.toAddress)).toEqual([EMAIL]);
  });

  it("emails the link to the address on file when the mobile number is given, and the link works", async () => {
    await openAccount(EMAIL, PHONE);
    expect(await requestPasswordReset(identifier("98200 11223"))).toBe("accepted");
    const sent = await outbox();
    expect(sent.map((row) => row.toAddress)).toEqual([EMAIL]);

    const token = /\/reset-password\/([A-Za-z0-9]+)/.exec(sent[0]?.bodyText ?? "")?.[1];
    if (token === undefined) throw new Error("The outbox copy holds no reset link.");
    expect(await resetPassword(token, NEW_PASSWORD)).toBe("changed");
    expect(await signInWithPassword(form("98200 11223", NEW_PASSWORD))).toMatchObject({ status: "signed-in" });
    expect(await signInWithPassword(form("98200 11223", PASSWORD))).toMatchObject({ status: "error" });
  });

  it("answers an unknown number, a number without an account and a known one the same, and writes to nobody for the first two", async () => {
    await openAccount("older@example.test", null);
    await openAccount(EMAIL, PHONE);
    expect(await requestPasswordReset(identifier("98765 43210"))).toBe("accepted");
    expect(await outbox()).toEqual([]);
    expect(await requestPasswordReset(identifier("nobody@example.test"))).toBe("accepted");
    expect(await outbox()).toEqual([]);
    expect(await requestPasswordReset(identifier("98200 11223"))).toBe("accepted");
    expect(await outbox()).toHaveLength(1);
  });

  it("sends an account at most 3 links an hour however it is asked for, and still answers as usual", async () => {
    await openAccount(EMAIL, PHONE);
    const asks = ["98200 11223", EMAIL, "+91 98200 11223", EMAIL, "98200 11223"];
    for (const typed of asks) expect(await requestPasswordReset(identifier(typed))).toBe("accepted");
    expect(await outbox()).toHaveLength(3);
  });

  it("holds a number to 3 requests an hour, and a network to 6", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await requestPasswordReset(identifier("98765 43210"))).toBe("accepted");
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await requestPasswordReset(identifier(`98765 4321${attempt}`))).toBe("accepted");
    expect(await requestPasswordReset(identifier("98765 43219"))).toBe("limited");
  });
});
