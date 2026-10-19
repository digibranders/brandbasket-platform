import { headers } from "next/headers";
import type { Auth } from "@brandbasket/auth";
import { isInvalidCredentialsError } from "@brandbasket/auth";
import { consumeRateLimit, findUserByPhone, type Database, type RateLimitResult } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { getAppDb } from "./db";
import { signInWithPassword } from "./sign-in";
import { noteSecurityEvent } from "./security-events";

// This module reaches a live database (via ./db and @brandbasket/db) and Better Auth (via ./auth), and
// reads the incoming request (via next/headers). All of that is replaced with test doubles so
// signInWithPassword's own decisions — parsing, rate-limit ordering, and error mapping — run in
// isolation. `server-only` is mocked because ./auth and ./db import it; without a mock it throws
// outside a genuine Next.js server context.
//
// `@brandbasket/auth` (rather than constructing a real `better-auth/api` APIError) is mocked here: it
// is not a direct dependency of apps/platform, so pnpm's strict linking makes `better-auth/api`
// unresolvable from this package, even though @brandbasket/auth re-exports from it transitively.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@brandbasket/auth", () => ({ isInvalidCredentialsError: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    consumeRateLimit: vi.fn(),
    findUserByPhone: vi.fn(),
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
    phoneAccountEmail: actual.phoneAccountEmail,
  };
});
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
// Signing in goes straight through to Better Auth here (customer-sign-in.test.ts covers the wrapper), so these tests check the sign-in itself.
vi.mock("./customer-sign-in", async () => {
  const { getAuth } = await import("./auth");
  return {
    signInCustomer: vi.fn(async (credentials: { email: string; password: string }, headers: Headers) => {
      const result = await getAuth().api.signInEmail({ body: { ...credentials }, headers });
      return { userId: result?.user.id };
    }),
  };
});
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./security-events", () => ({ noteSecurityEvent: vi.fn(async () => undefined) }));

const mockedHeaders = vi.mocked(headers);
const mockedIsInvalidCredentialsError = vi.mocked(isInvalidCredentialsError);
const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedGetAuth = vi.mocked(getAuth);
const mockedGetAppDb = vi.mocked(getAppDb);

const VALID_FORM = { identifier: "  Owner@Example.com ", password: "correct-horse" };
const NORMALISED_EMAIL = "owner@example.com";
const PHONE_FORM = { identifier: " 98200 11223 ", password: "correct-horse" };
const E164 = "+919820011223";
const PLACEHOLDER = "919820011223@phone.fynix.invalid";

const ALLOWED: RateLimitResult = { allowed: true, remaining: 10, retryAfterSeconds: 0 };

function blockedAfter(retryAfterSeconds: number): RateLimitResult {
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("signInWithPassword", () => {
  const signInEmail = vi.fn();
  const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

  beforeEach(() => {
    vi.resetAllMocks();
    mockedHeaders.mockResolvedValue(requestHeaders);
    mockedGetAppDb.mockReturnValue({} as unknown as Database);
    mockedGetAuth.mockReturnValue({ api: { signInEmail } } as unknown as Auth);
    mockedConsumeRateLimit.mockResolvedValue(ALLOWED);
    mockedIsInvalidCredentialsError.mockReturnValue(false);
    signInEmail.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns the parse error for invalid form input, never checking limits or calling signInEmail", async () => {
    const outcome = await signInWithPassword(form({ identifier: "", password: "secret-pass" }));

    expect(outcome).toEqual({ status: "error", message: "Enter your email address.", email: "" });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("asks for an email address, and signs in with one", async () => {
    expect(await signInWithPassword(form({ identifier: " ", password: "secret-pass" }))).toEqual({ status: "error", message: "Enter your email address.", email: "" });
    expect(await signInWithPassword(form(VALID_FORM))).toEqual({ status: "signed-in", userId: "user-1" });
    expect(signInEmail).toHaveBeenCalledWith({ body: { email: NORMALISED_EMAIL, password: VALID_FORM.password }, headers: requestHeaders });
  });

  it("consumes limits in order and stops checking at the first block", async () => {
    mockedConsumeRateLimit.mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(blockedAfter(120));

    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({
      status: "error",
      message: "Too many sign-in attempts. Try again in 2 minutes.",
      email: "Owner@Example.com",
    });
    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(2);
    expect(signInEmail).not.toHaveBeenCalled();
    // A block is counted as a possible attack, so many of them email the team.
    expect(noteSecurityEvent).toHaveBeenCalledWith("sign_in_blocked");
  });

  it("signs in with the normalised email once every limit allows the attempt", async () => {
    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({ status: "signed-in", userId: "user-1" });
    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: NORMALISED_EMAIL, password: VALID_FORM.password },
      headers: requestHeaders,
    });
  });

  it("maps an invalid-credentials failure to the friendly message and echoes the email", async () => {
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    mockedIsInvalidCredentialsError.mockReturnValue(true);

    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({
      status: "error",
      message: "That email and password don’t match an account.",
      email: "Owner@Example.com",
    });
  });

  it("signs a mobile number in as the account that owns it, with the limits keyed by the number", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-1", name: "Meera", email: PLACEHOLDER });

    expect(await signInWithPassword(form(PHONE_FORM))).toEqual({ status: "signed-in", userId: "user-1" });
    expect(findUserByPhone).toHaveBeenCalledWith(expect.anything(), E164);
    expect(signInEmail).toHaveBeenCalledWith({ body: { email: PLACEHOLDER, password: PHONE_FORM.password }, headers: requestHeaders });
    expect(mockedConsumeRateLimit.mock.calls.map((call) => call[1])).toEqual([
      "sign-in:client:203.0.113.7",
      `sign-in:account-client:${E164}:203.0.113.7`,
      `sign-in:account:${E164}`,
    ]);
  });

  it("checks a password even for a number with no account, so the answer takes as long and says the same", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    mockedIsInvalidCredentialsError.mockReturnValue(true);

    expect(await signInWithPassword(form(PHONE_FORM))).toEqual({
      status: "error",
      message: "That number and password don’t match an account.",
      email: "98200 11223",
    });
    expect(signInEmail).toHaveBeenCalledWith({ body: { email: PLACEHOLDER, password: PHONE_FORM.password }, headers: requestHeaders });
  });

  it("rethrows any other error from signInEmail", async () => {
    const failure = new Error("upstream auth outage");
    signInEmail.mockRejectedValue(failure);

    await expect(signInWithPassword(form(VALID_FORM))).rejects.toThrow(failure);
  });

  it("rethrows an error from the limiter, failing closed instead of skipping the checks", async () => {
    const failure = new Error("database unavailable");
    mockedConsumeRateLimit.mockRejectedValue(failure);

    await expect(signInWithPassword(form(VALID_FORM))).rejects.toThrow(failure);
    expect(signInEmail).not.toHaveBeenCalled();
  });
});
