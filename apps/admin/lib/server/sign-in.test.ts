import { headers } from "next/headers";
import type { Auth } from "@brandbasket/auth";
import { isInvalidCredentialsError } from "@brandbasket/auth";
import { consumeRateLimit, findActiveStaffMember, findActiveStaffUserIdByEmail, type Database, type RateLimitResult } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { signInWithPassword } from "./sign-in";
import { logStaffAccess } from "./staff-access-log";

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
    findActiveStaffMember: vi.fn(),
    findActiveStaffUserIdByEmail: vi.fn(),
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
  };
});
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./staff-access-log", () => ({ logStaffAccess: vi.fn() }));

const mockedHeaders = vi.mocked(headers);
const mockedIsInvalidCredentialsError = vi.mocked(isInvalidCredentialsError);
const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedGetAuth = vi.mocked(getAuth);
const mockedGetAppDb = vi.mocked(getStaffDb);

const VALID_FORM = { email: "  Owner@Example.com ", password: "correct-horse" };
const NORMALISED_EMAIL = "owner@example.com";

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
    vi.mocked(findActiveStaffMember).mockResolvedValue(null);
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue(null);
  });

  it("returns the parse error for invalid form input, never checking limits or calling signInEmail", async () => {
    const outcome = await signInWithPassword(form({ email: "", password: "secret-pass" }));

    expect(outcome).toEqual({ status: "error", message: "Enter your email address.", email: "" });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("refuses a phone account's placeholder address like any unknown account, without checking a password", async () => {
    const outcome = await signInWithPassword(form({ email: "919820011223@phone.brandbasket.invalid", password: "correct-horse" }));

    expect(outcome).toEqual({
      status: "error",
      message: "That email and password don’t match an account.",
      email: "919820011223@phone.brandbasket.invalid",
    });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("consumes limits in order and stops checking at the first block", async () => {
    mockedConsumeRateLimit.mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(blockedAfter(120));

    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({
      status: "error",
      message: "Too many sign-in attempts. Try again in 2 minutes.",
      email: NORMALISED_EMAIL,
    });
    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(2);
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("signs in with the normalised email once every limit allows the attempt", async () => {
    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({ status: "signed-in" });
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
      email: NORMALISED_EMAIL,
    });
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

  it("records a staff member's successful sign-in", async () => {
    signInEmail.mockResolvedValue({ user: { id: "staff-1" } });
    vi.mocked(findActiveStaffMember).mockResolvedValue({ userId: "staff-1", role: "support" });

    await signInWithPassword(form(VALID_FORM));

    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "staff.sign_in", result: "ok" });
  });

  it("records nothing when a customer account signs in here, because it gets no access", async () => {
    await signInWithPassword(form(VALID_FORM));
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("records a wrong password against the staff account being guessed", async () => {
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    mockedIsInvalidCredentialsError.mockReturnValue(true);
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue("staff-1");

    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(findActiveStaffUserIdByEmail).toHaveBeenCalledWith({}, NORMALISED_EMAIL);
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "staff.sign_in", result: "failed" });
    // The person at the keyboard learns nothing about whether the address is staff.
    expect(outcome).toEqual({ status: "error", message: "That email and password don’t match an account.", email: NORMALISED_EMAIL });
  });

  it("records nothing for a wrong password on an address that is not staff", async () => {
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    mockedIsInvalidCredentialsError.mockReturnValue(true);
    await signInWithPassword(form(VALID_FORM));
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("still signs in when the staff lookup or the log fails", async () => {
    vi.mocked(findActiveStaffMember).mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await signInWithPassword(form(VALID_FORM))).toEqual({ status: "signed-in" });
  });
});
