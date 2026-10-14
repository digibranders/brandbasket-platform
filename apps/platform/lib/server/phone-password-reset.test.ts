import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccountPassword } from "@firstfold/auth";
import { findUserByPhone, type Database } from "@firstfold/db";
import { confirmAccountOtp, requestAccountOtp } from "./account-otp";
import { getAuth } from "./auth";
import { getAppDb } from "./db";
import { parseForgotPasswordRequest, requestPhonePasswordReset, resetPasswordWithCode } from "./phone-password-reset";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })) }));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
vi.mock("./account-otp", () => ({ requestAccountOtp: vi.fn(), confirmAccountOtp: vi.fn() }));
vi.mock("@firstfold/auth", () => ({ setAccountPassword: vi.fn() }));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return { findUserByPhone: vi.fn(), isPhoneAccountEmail: actual.isPhoneAccountEmail };
});

const DB = {} as Database;
const AUTH = {} as ReturnType<typeof getAuth>;
const E164 = "+919820011223";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ACCOUNT = { id: "user-1", name: "Meera", email: "919820011223@phone.firstfold.invalid" };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(DB);
  vi.mocked(getAuth).mockReturnValue(AUTH);
  vi.mocked(findUserByPhone).mockResolvedValue(ACCOUNT);
  vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 1223", texted: true });
  vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "confirmed" });
});

describe("parseForgotPasswordRequest for a brand that signs in with an email (Fynix)", () => {
  it("reads an email, as before", () => {
    expect(parseForgotPasswordRequest(form({ identifier: " Meera@Example.com " }), "email")).toEqual({
      success: true,
      data: { kind: "email", email: "meera@example.com" },
    });
  });

  it("asks for an email, and never turns a mobile number into a text", () => {
    expect(parseForgotPasswordRequest(form({ identifier: "98200 11223" }), "email")).toEqual({ success: false, message: "Enter your email address." });
    expect(parseForgotPasswordRequest(form({ identifier: "" }), "email")).toEqual({ success: false, message: "Enter your email address." });
  });
});

describe("parseForgotPasswordRequest", () => {
  it("reads an email as the emailed-link way back in", () => {
    expect(parseForgotPasswordRequest(form({ identifier: " Meera@Example.com " }))).toEqual({
      success: true,
      data: { kind: "email", email: "meera@example.com" },
    });
  });

  it("reads a mobile number alone as: text me a code", () => {
    expect(parseForgotPasswordRequest(form({ identifier: "98200 11223" }))).toEqual({
      success: true,
      data: { kind: "phone", phone: E164, reset: null },
    });
  });

  it("reads the code step: the code, the one it answers, and the new password typed twice", () => {
    expect(
      parseForgotPasswordRequest(
        form({ identifier: "98200 11223", otpId: OTP_ID, code: "123 456", password: "a-brand-new-password", confirmPassword: "a-brand-new-password" }),
      ),
    ).toEqual({ success: true, data: { kind: "phone", phone: E164, reset: { otpId: OTP_ID, code: "123456", password: "a-brand-new-password" } } });
  });

  it("refuses a code that is not six digits, a short password, and two passwords that differ", () => {
    const step = { identifier: "98200 11223", otpId: OTP_ID, code: "123456", password: "a-brand-new-password", confirmPassword: "a-brand-new-password" };
    expect(parseForgotPasswordRequest(form({ ...step, code: "12" }))).toEqual({ success: false, message: "Enter the 6-digit code we texted you." });
    expect(parseForgotPasswordRequest(form({ ...step, password: "short", confirmPassword: "short" }))).toEqual({
      success: false,
      message: "Use at least 10 characters.",
    });
    expect(parseForgotPasswordRequest(form({ ...step, confirmPassword: "something-else" }))).toEqual({
      success: false,
      message: "Both passwords must match.",
    });
  });

  it("asks for a number or an email when the field is empty", () => {
    expect(parseForgotPasswordRequest(form({ identifier: "" }))).toEqual({ success: false, message: "Enter your mobile number." });
  });
});

describe("requestPhonePasswordReset", () => {
  it.each(["network", "phone", "global"] as const)("retains %s limits without claiming this number was texted", async (scope) => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "limited", scope, retryAfterSeconds: 137 });
    expect(await requestPhonePasswordReset(E164)).toMatchObject({ kind: "limited", scope, retryAfterSeconds: 137 });
  });

  it("texts a reset code to a number that has an account", async () => {
    expect(await requestPhonePasswordReset(E164)).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "•••• 1223" } });
    expect(requestAccountOtp).toHaveBeenCalledWith({ purpose: "password_reset", phone: E164, send: true }, "203.0.113.9", expect.any(Date));
  });

  it("answers the same for a number with no account, and texts nothing", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);
    expect(await requestPhonePasswordReset(E164)).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "•••• 1223" } });
    expect(requestAccountOtp).toHaveBeenCalledWith({ purpose: "password_reset", phone: E164, send: false }, "203.0.113.9", expect.any(Date));
  });

  it("says so when texting is limited or not available", async () => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 137 });
    expect(await requestPhonePasswordReset(E164)).toMatchObject({ kind: "limited" });
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "unavailable" });
    expect(await requestPhonePasswordReset(E164)).toMatchObject({ kind: "refused" });
  });
});

describe("resetPasswordWithCode", () => {
  const input = { phone: E164, otpId: OTP_ID, code: "123456", password: "a-brand-new-password" };

  it("sets the new password for the number's account once the code is confirmed", async () => {
    expect(await resetPasswordWithCode(input)).toEqual({ kind: "changed" });
    expect(confirmAccountOtp).toHaveBeenCalledWith(
      { otpId: OTP_ID, code: "123456", purpose: "password_reset", phone: E164 },
      "203.0.113.9",
      expect.any(Date),
    );
    expect(setAccountPassword).toHaveBeenCalledWith(AUTH, "user-1", "a-brand-new-password");
  });

  it("changes nothing on a wrong code, and says how many tries are left", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "wrong_code", triesLeft: 2 });
    expect(await resetPasswordWithCode(input)).toEqual({ kind: "wrong-code", message: "That code isn't right. 2 tries left." });
    expect(setAccountPassword).not.toHaveBeenCalled();
  });

  it("asks for a new code when this one has run out or was never sent", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "expired" });
    expect(await resetPasswordWithCode(input)).toEqual({ kind: "wrong-code", message: "That code has run out. Send a new one." });
    expect(setAccountPassword).not.toHaveBeenCalled();
  });

  it("changes nothing when the number has no account after all", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);
    expect(await resetPasswordWithCode(input)).toEqual({ kind: "wrong-code", message: "That code has run out. Send a new one." });
    expect(setAccountPassword).not.toHaveBeenCalled();
  });
});
