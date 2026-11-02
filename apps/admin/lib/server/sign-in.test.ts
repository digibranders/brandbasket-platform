import { headers } from "next/headers";
import type { Auth } from "@brandbasket/auth";
import {
  issueStaffSignInCode,
  STAFF_SIGN_IN_CODE_TTL_SECONDS,
  verifyCredentials,
  verifyStaffSignInCode,
  withdrawStaffSignInCode,
} from "@brandbasket/auth";
import { consumeRateLimit, findActiveStaffMember, findActiveStaffUserIdByEmail, findUserByEmail, type Database, type RateLimitResult } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_VALID_MINUTES } from "@/lib/staff-sign-in-form";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { finishSignIn, signInWithPassword } from "./sign-in";
import { logStaffAccess } from "./staff-access-log";

// This module reaches a live database (via ./db and @brandbasket/db), Better Auth (via ./auth), the mailer and the
// request (via next/headers). All of that is replaced with test doubles so the module's own decisions run in isolation:
// parsing, rate-limit ordering, what is answered for a wrong password, when a session may start, and what is logged.
// The code and session mechanics are covered against a real database in packages/auth.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@brandbasket/auth", () => ({
  issueStaffSignInCode: vi.fn(),
  STAFF_SIGN_IN_CODE_TTL_SECONDS: 300,
  verifyCredentials: vi.fn(),
  verifyStaffSignInCode: vi.fn(),
  withdrawStaffSignInCode: vi.fn(),
}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    consumeRateLimit: vi.fn(),
    findActiveStaffMember: vi.fn(),
    findActiveStaffUserIdByEmail: vi.fn(),
    findUserByEmail: vi.fn(),
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
  };
});
const send = vi.fn();
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn(() => ({ send })), emailCodeBypassed: vi.fn(() => false) }));
vi.mock("./env", () => ({ serverEnv: () => ({ BETTER_AUTH_SECRET: "x".repeat(32) }) }));
vi.mock("./staff-access-log", () => ({ logStaffAccess: vi.fn() }));

const VALID_FORM = { email: "  Owner@Example.com ", password: "correct-horse" };
const NORMALISED_EMAIL = "owner@example.com";
const ALLOWED: RateLimitResult = { allowed: true, remaining: 10, retryAfterSeconds: 0 };
const OTP_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const NO_MATCH = "That email and password don’t match an account.";

function blockedAfter(retryAfterSeconds: number): RateLimitResult {
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const completeStaffSignIn = vi.fn();
const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(headers).mockResolvedValue(requestHeaders);
  vi.mocked(getStaffDb).mockReturnValue({} as unknown as Database);
  vi.mocked(getAuth).mockReturnValue({ api: { completeStaffSignIn } } as unknown as Auth);
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOWED);
  vi.mocked(verifyCredentials).mockResolvedValue({ userId: "user-1", email: NORMALISED_EMAIL });
  vi.mocked(issueStaffSignInCode).mockResolvedValue({ kind: "issued", otpId: OTP_ID, code: "482913", expiresInSeconds: 300 });
  vi.mocked(findActiveStaffMember).mockResolvedValue(null);
  vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue(null);
  vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", name: "Riley", email: NORMALISED_EMAIL });
  send.mockResolvedValue(undefined);
});

it("tells the page how long the code works, the way the auth package defines it", () => {
  expect(CODE_VALID_MINUTES * 60).toBe(STAFF_SIGN_IN_CODE_TTL_SECONDS);
});

describe("signInWithPassword", () => {
  it("returns the parse error for invalid form input, never checking limits or the password", async () => {
    const outcome = await signInWithPassword(form({ email: "", password: "secret-pass" }));
    expect(outcome).toEqual({ status: "error", message: "Enter your email address.", email: "" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses a phone account's placeholder address like any unknown account, without checking a password", async () => {
    const outcome = await signInWithPassword(form({ email: "919820011223@phone.brandbasket.invalid", password: "correct-horse" }));
    expect(outcome).toEqual({ status: "error", message: NO_MATCH, email: "919820011223@phone.brandbasket.invalid" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("consumes limits in order and stops checking at the first block", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(blockedAfter(120));
    const outcome = await signInWithPassword(form(VALID_FORM));
    expect(outcome).toEqual({ status: "error", message: "Too many sign-in attempts. Try again in 2 minutes.", email: NORMALISED_EMAIL });
    expect(consumeRateLimit).toHaveBeenCalledTimes(2);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("emails a code and starts no session when the password is right", async () => {
    const outcome = await signInWithPassword(form(VALID_FORM));

    expect(outcome).toEqual({ status: "code", email: NORMALISED_EMAIL, otpId: OTP_ID });
    expect(verifyCredentials).toHaveBeenCalledWith(expect.anything(), NORMALISED_EMAIL, VALID_FORM.password);
    expect(issueStaffSignInCode).toHaveBeenCalledWith({}, expect.objectContaining({ email: NORMALISED_EMAIL, clientIp: "203.0.113.7" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: NORMALISED_EMAIL, template: "staff-sign-in-code" }));
    expect(completeStaffSignIn).not.toHaveBeenCalled();
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("answers a wrong password with the friendly message and issues no code", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    const outcome = await signInWithPassword(form(VALID_FORM));
    expect(outcome).toEqual({ status: "error", message: NO_MATCH, email: NORMALISED_EMAIL });
    expect(issueStaffSignInCode).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("records a wrong password against the staff account being guessed, and tells the keyboard nothing about it", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue("staff-1");
    const outcome = await signInWithPassword(form(VALID_FORM));
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "staff.sign_in", result: "failed", detail: "wrong password" });
    expect(outcome).toEqual({ status: "error", message: NO_MATCH, email: NORMALISED_EMAIL });
  });

  it("records nothing for a wrong password on an address that is not staff", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);
    await signInWithPassword(form(VALID_FORM));
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("says when too many codes were asked for, without emailing", async () => {
    vi.mocked(issueStaffSignInCode).mockResolvedValue({ kind: "limited", retryAfterSeconds: 400 });
    const outcome = await signInWithPassword(form(VALID_FORM));
    expect(outcome).toEqual({ status: "error", message: "Too many sign-in attempts. Try again in 7 minutes.", email: NORMALISED_EMAIL });
    expect(send).not.toHaveBeenCalled();
  });

  it("uses up the code and says so when it cannot be emailed", async () => {
    send.mockRejectedValue(new Error("brevo down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await signInWithPassword(form(VALID_FORM));
    expect(outcome).toEqual({ status: "error", message: "We couldn’t send the code. Try again in a minute.", email: NORMALISED_EMAIL });
    expect(withdrawStaffSignInCode).toHaveBeenCalledWith({}, OTP_ID);
  });

  it("rethrows an error from the limiter, failing closed instead of skipping the checks", async () => {
    const failure = new Error("database unavailable");
    vi.mocked(consumeRateLimit).mockRejectedValue(failure);
    await expect(signInWithPassword(form(VALID_FORM))).rejects.toThrow(failure);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });
});

describe("finishSignIn", () => {
  const CODE_FORM = { otpId: OTP_ID, code: "482 913" };

  it("starts the session only for a verified code, then records the sign-in of a staff member", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "verified", email: NORMALISED_EMAIL });
    vi.mocked(findActiveStaffMember).mockResolvedValue({ userId: "user-1", role: "support" });

    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "signed-in" });

    expect(verifyStaffSignInCode).toHaveBeenCalledWith({}, expect.objectContaining({ otpId: OTP_ID, code: "482913", clientIp: "203.0.113.7", acceptAnySixDigits: false }));
    expect(completeStaffSignIn).toHaveBeenCalledWith({ body: { userId: "user-1" }, headers: requestHeaders });
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "user-1", action: "staff.sign_in", result: "ok" });
  });

  it("records nothing when a customer account finishes a sign-in here, because it gets no access", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "verified", email: NORMALISED_EMAIL });
    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "signed-in" });
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("starts no session for a wrong code, says how many tries are left, and logs it against the staff account", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "wrong_code", triesLeft: 4, email: NORMALISED_EMAIL });
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue("user-1");

    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "error", message: "That code isn’t right. 4 tries left.", restart: false });

    expect(completeStaffSignIn).not.toHaveBeenCalled();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "user-1", action: "staff.sign_in", result: "failed", detail: "wrong code" });
  });

  it("uses the singular for the last try", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "wrong_code", triesLeft: 1, email: NORMALISED_EMAIL });
    expect(await finishSignIn(form(CODE_FORM))).toMatchObject({ message: "That code isn’t right. 1 try left." });
  });

  it("asks for six digits when the input was not a code, and logs nothing", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "wrong_code", triesLeft: null, email: null });
    expect(await finishSignIn(form({ otpId: OTP_ID, code: "abc" }))).toEqual({ status: "error", message: "Enter the 6-digit code from your email.", restart: false });
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("sends an expired, used or out-of-tries code back to the password, with no session", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "expired", email: null });
    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "error", message: "That code has expired. Sign in again to get a new one.", restart: true });
    expect(completeStaffSignIn).not.toHaveBeenCalled();
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("logs the fifth wrong code of a staff account as a failed sign-in", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "expired", email: NORMALISED_EMAIL });
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue("user-1");
    await finishSignIn(form(CODE_FORM));
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "user-1", action: "staff.sign_in", result: "failed", detail: "code tries used up" });
  });

  it("relays the limit without a session", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "limited", retryAfterSeconds: 60 });
    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "error", message: "Too many sign-in attempts. Try again in 1 minute.", restart: false });
    expect(completeStaffSignIn).not.toHaveBeenCalled();
  });

  it("sends the person back to the password when the account vanished after the code was right", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "verified", email: NORMALISED_EMAIL });
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    expect(await finishSignIn(form(CODE_FORM))).toMatchObject({ status: "error", restart: true });
    expect(completeStaffSignIn).not.toHaveBeenCalled();
  });

  it("still signs in when the staff lookup or the log fails", async () => {
    vi.mocked(verifyStaffSignInCode).mockResolvedValue({ kind: "verified", email: NORMALISED_EMAIL });
    vi.mocked(findActiveStaffMember).mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await finishSignIn(form(CODE_FORM))).toEqual({ status: "signed-in" });
  });
});
