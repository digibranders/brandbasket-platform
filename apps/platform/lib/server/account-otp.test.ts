import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  consumeRateLimit,
  createAccountOtp,
  purgeExpiredAccountOtps,
  type AccountOtpAttempt,
  type Database,
} from "@firstfold/db";
import { confirmAccountOtp, requestAccountOtp } from "./account-otp";
import { getStaffDb } from "./db";
import { bookingOtpSecret, signupOtpBypassed, smsAllowedCountryCodes, verifyOtpBypassed } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { createSmsSender, SmsProviderUnavailableError } from "./sms";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./env", () => ({ bookingOtpSecret: vi.fn(), signupOtpBypassed: vi.fn(), smsAllowedCountryCodes: vi.fn(), verifyOtpBypassed: vi.fn() }));
vi.mock("./sms", async () => {
  const actual = await vi.importActual<typeof import("./sms")>("./sms");
  return { createSmsSender: vi.fn(), otpMessage: actual.otpMessage, SmsProviderUnavailableError: actual.SmsProviderUnavailableError };
});
vi.mock("@firstfold/db", () => ({
  claimAccountOtpAttempt: vi.fn(),
  consumeAccountOtp: vi.fn(),
  consumeRateLimit: vi.fn(),
  createAccountOtp: vi.fn(),
  purgeExpiredAccountOtps: vi.fn(),
}));

const SECRET = "s".repeat(32);
const NOW = new Date("2026-09-30T10:00:00.000Z");
const PHONE = "+919876543210";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const IP = "203.0.113.9";
const DB = {} as Database;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const send = vi.fn<(message: { to: string; body: string; businessId: string | null }) => Promise<void>>();

function attempt(overrides: Partial<AccountOtpAttempt> = {}): AccountOtpAttempt {
  return { attempts: 1, purpose: "signup", phone: PHONE, email: null, codeHash: hashOtpCode(OTP_ID, "123456", SECRET), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(signupOtpBypassed).mockReturnValue(false);
  vi.mocked(verifyOtpBypassed).mockReturnValue(false);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(bookingOtpSecret).mockReturnValue(SECRET);
  vi.mocked(smsAllowedCountryCodes).mockReturnValue(["91"]);
  vi.mocked(createSmsSender).mockReturnValue({ send });
  send.mockResolvedValue(undefined);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(purgeExpiredAccountOtps).mockResolvedValue(0);
  vi.mocked(createAccountOtp).mockImplementation(async (_db, otp) => otp.id);
  vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt());
  vi.mocked(consumeAccountOtp).mockResolvedValue(true);
});

describe("requestAccountOtp", () => {
  it.each([
    [0, "network"], [1, "phone"], [2, "phone"], [3, "global"],
  ] as const)("preserves blocked budget %s scope and its actual retry time", async (index, scope) => {
    for (let allowed = 0; allowed < index; allowed++) {
      vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    }
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 137 });
    expect(await requestAccountOtp({ purpose: "password_reset", phone: PHONE, send: false }, IP, NOW))
      .toEqual({ kind: "limited", scope, retryAfterSeconds: 137 });
    expect(createAccountOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("stores a hashed code for the number and texts the code", async () => {
    const outcome = await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", expiresInSeconds: 600, phoneHint: "•••• 3210", texted: true });

    const stored = vi.mocked(createAccountOtp).mock.calls[0]?.[1];
    expect(stored).toMatchObject({ purpose: "signup", phone: PHONE, expiresAt: new Date(NOW.getTime() + 600_000) });
    const message = send.mock.calls[0]?.[0];
    const code = /^(\d{6}) is your Firstfold code\. It expires in 10 minutes\. Do not share it\.$/.exec(message?.body ?? "")?.[1];
    expect(code).toBeDefined();
    expect(message).toMatchObject({ to: PHONE, businessId: null });
    expect(stored?.codeHash).toBe(hashOtpCode(stored?.id ?? "", code ?? "", SECRET));
    expect(outcome).toMatchObject({ otpId: stored?.id });
  });

  it("answers the same way and stores a code nobody is sent when told not to send", async () => {
    // A password reset for a number with no account: the stranger asking must not learn that, nor cost us a text.
    // The code is stored all the same, so guessing at it answers exactly as it would for a real account.
    const outcome = await requestAccountOtp({ purpose: "password_reset", phone: PHONE, send: false }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", expiresInSeconds: 600, phoneHint: "•••• 3210" });
    const stored = vi.mocked(createAccountOtp).mock.calls[0]?.[1];
    expect(stored).toMatchObject({ purpose: "password_reset", phone: PHONE });
    expect(outcome.kind === "sent" ? outcome.otpId : "").toBe(stored?.id);
    expect(outcome.kind === "sent" ? outcome.otpId : "").toMatch(UUID);
    expect(send).not.toHaveBeenCalled();
    // The budgets are spent all the same, so asking again and again is limited either way.
    expect(consumeRateLimit).toHaveBeenCalled();
  });

  it("refuses a number outside the countries we text, before any budget is spent", async () => {
    const outcome = await requestAccountOtp({ purpose: "signup", phone: "+14155550123", send: true }, IP, NOW);
    expect(outcome.kind).toBe("invalid");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("is limited per network, per number and overall", async () => {
    await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW);
    const keys = vi.mocked(consumeRateLimit).mock.calls.map((call) => call[1]);
    expect(keys).toEqual([
      expect.stringMatching(/^account-otp:ip:/),
      `account-otp:phone:10m:${PHONE}`,
      `account-otp:phone:day:${PHONE}`,
      "account-otp:all",
    ]);
  });

  it("sends nothing once a budget is spent", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
    expect(createAccountOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("is unavailable where production has no way to text", async () => {
    vi.mocked(createSmsSender).mockImplementation(() => {
      throw new SmsProviderUnavailableError();
    });
    expect(await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW)).toEqual({ kind: "unavailable" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("uses the code up again when the text cannot be sent", async () => {
    send.mockRejectedValue(new Error("provider down"));
    expect(await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW)).toEqual({ kind: "failed" });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, vi.mocked(createAccountOtp).mock.calls[0]?.[1].id);
  });
});

describe("confirmAccountOtp", () => {
  const input = { otpId: OTP_ID, code: "123456", purpose: "signup" as const, phone: PHONE };

  it("confirms the right code once, and uses it up", async () => {
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "confirmed" });
    expect(claimAccountOtpAttempt).toHaveBeenCalledWith(DB, { otpId: OTP_ID, maxAttempts: 5, now: NOW });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, OTP_ID);
  });

  it("says how many tries are left after a wrong code", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ attempts: 2 }));
    expect(await confirmAccountOtp({ ...input, code: "000000" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 3 });
    expect(consumeAccountOtp).not.toHaveBeenCalled();
  });

  it("asks for a new code after the last wrong try", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ attempts: 5 }));
    expect(await confirmAccountOtp({ ...input, code: "000000" }, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("treats a code that ran out, was used, or never existed as expired", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(null);
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("does not let a code for one number, or one purpose, confirm another", async () => {
    expect(await confirmAccountOtp({ ...input, phone: "+919876500000" }, IP, NOW)).toMatchObject({ kind: "wrong_code" });
    expect(await confirmAccountOtp({ ...input, purpose: "password_reset" }, IP, NOW)).toMatchObject({ kind: "wrong_code" });
    expect(consumeAccountOtp).not.toHaveBeenCalled();
  });

  it("refuses anything that is not six digits without spending a try", async () => {
    expect(await confirmAccountOtp({ ...input, code: "12345" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: null });
    expect(claimAccountOtpAttempt).not.toHaveBeenCalled();
  });

  it("lets only one of two submissions of the right code through", async () => {
    vi.mocked(consumeAccountOtp).mockResolvedValue(false);
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("is limited per network, to slow guessing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
    expect(claimAccountOtpAttempt).not.toHaveBeenCalled();
  });
});

describe("with the sign-up code check switched off (SIGNUP_OTP_BYPASS)", () => {
  const input = { otpId: OTP_ID, code: "000000", purpose: "signup" as const, phone: PHONE };

  beforeEach(() => {
    vi.mocked(signupOtpBypassed).mockReturnValue(true);
  });

  it("texts nothing for a sign-up and needs no SMS provider, even where production has none", async () => {
    vi.mocked(createSmsSender).mockImplementation(() => {
      throw new SmsProviderUnavailableError();
    });
    const outcome = await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", phoneHint: "•••• 3210", texted: false });
    expect(createSmsSender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    // The step is still stored, so it runs out, is used once, and has its five tries.
    expect(vi.mocked(createAccountOtp).mock.calls[0]?.[1]).toMatchObject({ purpose: "signup", phone: PHONE });
  });

  it("keeps the country rule and the limits for a sign-up", async () => {
    expect((await requestAccountOtp({ purpose: "signup", phone: "+14155550123", send: true }, IP, NOW)).kind).toBe("invalid");
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await requestAccountOtp({ purpose: "signup", phone: PHONE, send: true }, IP, NOW)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
  });

  it("confirms a sign-up with any six digits, once", async () => {
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "confirmed" });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, OTP_ID);
    vi.mocked(consumeAccountOtp).mockResolvedValue(false);
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("still wants six digits, and the step's own number", async () => {
    expect(await confirmAccountOtp({ ...input, code: "12ab" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: null });
    expect(await confirmAccountOtp({ ...input, phone: "+919800000000" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
  });

  it("never applies to a password reset: that code is still texted and still has to be right", async () => {
    const outcome = await requestAccountOtp({ purpose: "password_reset", phone: PHONE, send: true }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", texted: true });
    expect(send).toHaveBeenCalledTimes(1);

    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ purpose: "password_reset" }));
    expect(await confirmAccountOtp({ ...input, purpose: "password_reset" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
    expect(consumeAccountOtp).not.toHaveBeenCalled();
  });

  it("does not let a sign-up step stand in for a password reset", async () => {
    // The stored step is a sign-up's; asking to reset a password on its strength is a wrong code, bypass or not.
    expect(await confirmAccountOtp({ ...input, purpose: "password_reset" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
  });
});

describe("with the business verification code check switched off (VERIFY_OTP_BYPASS)", () => {
  const input = { otpId: OTP_ID, code: "000000", purpose: "verify_business" as const, phone: PHONE };

  beforeEach(() => {
    vi.mocked(verifyOtpBypassed).mockReturnValue(true);
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ purpose: "verify_business" }));
  });

  it("texts nothing for a business verification and needs no SMS provider", async () => {
    vi.mocked(createSmsSender).mockImplementation(() => {
      throw new SmsProviderUnavailableError();
    });
    const outcome = await requestAccountOtp({ purpose: "verify_business", phone: PHONE, send: true }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", phoneHint: "•••• 3210", texted: false });
    expect(send).not.toHaveBeenCalled();
    expect(vi.mocked(createAccountOtp).mock.calls[0]?.[1]).toMatchObject({ purpose: "verify_business", phone: PHONE });
  });

  it("confirms a business verification with any six digits, once, for the step's own number", async () => {
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "confirmed" });
    expect(await confirmAccountOtp({ ...input, code: "12ab" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: null });
    expect(await confirmAccountOtp({ ...input, phone: "+919800000000" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
  });

  it("is texted and checked as normal when the switch is off", async () => {
    vi.mocked(verifyOtpBypassed).mockReturnValue(false);
    vi.mocked(createSmsSender).mockReturnValue({ send } as unknown as ReturnType<typeof createSmsSender>);
    const outcome = await requestAccountOtp({ purpose: "verify_business", phone: PHONE, send: true }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", texted: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await confirmAccountOtp(input, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
  });

  it("does not switch off a sign-up's or a password reset's code", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ purpose: "signup" }));
    expect(await confirmAccountOtp({ ...input, purpose: "signup" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ purpose: "password_reset" }));
    expect(await confirmAccountOtp({ ...input, purpose: "password_reset" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 4 });
  });
});
