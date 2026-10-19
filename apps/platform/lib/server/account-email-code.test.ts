import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  consumeRateLimit,
  createAccountOtp,
  purgeExpiredAccountOtps,
  type AccountOtpAttempt,
  type Database,
} from "@brandbasket/db";
import { EmailConfigurationError, type EmailMessage } from "@brandbasket/email";
import { BRAND } from "@/lib/brand";
import { confirmAccountEmailCode, requestAccountEmailCode } from "./account-email-code";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { currentBrand } from "./request-brand";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn(() => ({})) }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./request-brand", () => ({ currentBrand: vi.fn() }));
vi.mock("./env", () => ({ accountCodeSecret: vi.fn(), emailCodeBypassed: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  claimAccountOtpAttempt: vi.fn(),
  consumeAccountOtp: vi.fn(),
  consumeRateLimit: vi.fn(),
  createAccountOtp: vi.fn(),
  purgeExpiredAccountOtps: vi.fn(),
}));

const SECRET = "s".repeat(32);
const NOW = new Date("2026-10-14T10:00:00.000Z");
const EMAIL = "meera.shah@example.test";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const IP = "203.0.113.9";
const DB = {} as Database;

const send = vi.fn<(message: EmailMessage) => Promise<void>>();

function attempt(overrides: Partial<AccountOtpAttempt> = {}): AccountOtpAttempt {
  return { attempts: 1, purpose: "signup", email: EMAIL, codeHash: hashOtpCode(OTP_ID, "123456", SECRET), ...overrides };
}

/** The six digits emailed in the message the code was sent in. */
function emailedCode(): string | undefined {
  return /\n\n(\d{6})\n\n/.exec(send.mock.calls[0]?.[0].bodyText ?? "")?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(emailCodeBypassed).mockReturnValue(false);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(accountCodeSecret).mockReturnValue(SECRET);
  vi.mocked(currentBrand).mockResolvedValue(BRAND);
  vi.mocked(customerEmailTransport).mockReturnValue({ send });
  send.mockResolvedValue(undefined);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(purgeExpiredAccountOtps).mockResolvedValue(0);
  vi.mocked(createAccountOtp).mockImplementation(async (_db, otp) => otp.id);
  vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt());
  vi.mocked(consumeAccountOtp).mockResolvedValue(true);
});

describe("requestAccountEmailCode", () => {
  it("stores a hashed code for the address and emails the code, as Fynix, for ten minutes", async () => {
    const outcome = await requestAccountEmailCode({ email: EMAIL }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", expiresInSeconds: 600, emailHint: "m•••@example.test", confirmRequired: true });

    const stored = vi.mocked(createAccountOtp).mock.calls[0]?.[1];
    expect(stored).toMatchObject({ purpose: "signup", email: EMAIL, expiresAt: new Date(NOW.getTime() + 600_000) });
    expect(stored).not.toHaveProperty("phone");

    const message = send.mock.calls[0]?.[0];
    expect(message).toMatchObject({ to: EMAIL, template: "signup-code", subject: "Your Fynix Digital verification code" });
    expect(message?.bodyText).toContain("expires in 10 minutes");
    expect(message?.bodyText).not.toMatch(/first\s?fold/i);
    const code = emailedCode();
    expect(code).toBeDefined();
    expect(stored?.codeHash).toBe(hashOtpCode(stored?.id ?? "", code ?? "", SECRET));
    expect(stored?.codeHash).not.toContain(code ?? "unreachable");
    expect(outcome).toMatchObject({ otpId: stored?.id });
  });

  it("is limited per network, per address and overall, with the same budgets as a texted code", async () => {
    await requestAccountEmailCode({ email: EMAIL }, IP, NOW);
    const calls = vi.mocked(consumeRateLimit).mock.calls;
    expect(calls.map((call) => call[1])).toEqual([
      expect.stringMatching(/^account-email-code:ip:/),
      `account-email-code:email:10m:${EMAIL}`,
      `account-email-code:email:day:${EMAIL}`,
      "account-email-code:all",
    ]);
    expect(calls.map((call) => call[2])).toEqual([
      { limit: 10, windowSeconds: 3600 },
      { limit: 3, windowSeconds: 600 },
      { limit: 8, windowSeconds: 86_400 },
      { limit: 1000, windowSeconds: 86_400 },
    ]);
  });

  it.each([
    [0, "network"], [1, "email"], [2, "email"], [3, "global"],
  ] as const)("reports which budget %s blocked (%s) and how long to wait, sending nothing", async (index, scope) => {
    for (let allowed = 0; allowed < index; allowed++) {
      vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    }
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 137 });
    expect(await requestAccountEmailCode({ email: EMAIL }, IP, NOW)).toEqual({ kind: "limited", scope, retryAfterSeconds: 137 });
    expect(createAccountOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("is unavailable where real customers can reach the app and no email provider is set, spending no budget", async () => {
    vi.mocked(customerEmailTransport).mockImplementation(() => {
      throw new EmailConfigurationError("BREVO_API_KEY must be set");
    });
    expect(await requestAccountEmailCode({ email: EMAIL }, IP, NOW)).toEqual({ kind: "unavailable" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(createAccountOtp).not.toHaveBeenCalled();
  });

  it("uses the code up again when the email cannot be sent", async () => {
    send.mockRejectedValue(new Error("outbox down"));
    expect(await requestAccountEmailCode({ email: EMAIL }, IP, NOW)).toEqual({ kind: "failed" });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, vi.mocked(createAccountOtp).mock.calls[0]?.[1].id);
  });

  it("names the brand the request came in on", async () => {
    vi.mocked(currentBrand).mockResolvedValue(BRAND);
    await requestAccountEmailCode({ email: EMAIL }, IP, NOW);
    expect(send.mock.calls[0]?.[0].subject).toBe("Your Fynix Digital verification code");
  });
});

describe("confirmAccountEmailCode", () => {
  const input = { otpId: OTP_ID, code: "123456", email: EMAIL };

  it("confirms the right code once, and uses it up", async () => {
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "confirmed" });
    expect(claimAccountOtpAttempt).toHaveBeenCalledWith(DB, { otpId: OTP_ID, maxAttempts: 5, now: NOW });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, OTP_ID);
  });

  it("says how many tries are left after a wrong code, and asks for a new one after the fifth", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ attempts: 2 }));
    expect(await confirmAccountEmailCode({ ...input, code: "000000" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: 3 });
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(attempt({ attempts: 5 }));
    expect(await confirmAccountEmailCode({ ...input, code: "000000" }, IP, NOW)).toEqual({ kind: "expired" });
    expect(consumeAccountOtp).not.toHaveBeenCalled();
  });

  it("treats a code that ran out, was used or never existed as expired", async () => {
    vi.mocked(claimAccountOtpAttempt).mockResolvedValue(null);
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("does not let a code for another address confirm this one", async () => {
    expect(await confirmAccountEmailCode({ ...input, email: "someone.else@example.test" }, IP, NOW)).toMatchObject({ kind: "wrong_code" });
    expect(consumeAccountOtp).not.toHaveBeenCalled();
  });

  it("refuses anything that is not six digits without spending a try", async () => {
    expect(await confirmAccountEmailCode({ ...input, code: "12345" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: null });
    expect(claimAccountOtpAttempt).not.toHaveBeenCalled();
  });

  it("lets only one of two submissions of the right code through", async () => {
    vi.mocked(consumeAccountOtp).mockResolvedValue(false);
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("is limited per network, to slow guessing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
    expect(claimAccountOtpAttempt).not.toHaveBeenCalled();
    const [, key, rule] = vi.mocked(consumeRateLimit).mock.calls[0] ?? [];
    expect(key).toMatch(/^account-email-code-confirm:ip:/);
    expect(rule).toEqual({ limit: 30, windowSeconds: 3600 });
  });
});

describe("with the email code check switched off (EMAIL_CODE_BYPASS)", () => {
  const input = { otpId: OTP_ID, code: "000000", email: EMAIL };

  beforeEach(() => {
    vi.mocked(emailCodeBypassed).mockReturnValue(true);
  });

  it("still emails the code, so the local outbox has it, but says none needs reading", async () => {
    const outcome = await requestAccountEmailCode({ email: EMAIL }, IP, NOW);
    expect(outcome).toMatchObject({ kind: "sent", confirmRequired: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("confirms with any six digits, once, still bound to the step's own address and purpose", async () => {
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "confirmed" });
    expect(consumeAccountOtp).toHaveBeenCalledWith(DB, OTP_ID);
    expect(await confirmAccountEmailCode({ ...input, email: "someone.else@example.test" }, IP, NOW)).toMatchObject({ kind: "wrong_code" });
    vi.mocked(consumeAccountOtp).mockResolvedValue(false);
    expect(await confirmAccountEmailCode(input, IP, NOW)).toEqual({ kind: "expired" });
  });

  it("still wants six digits", async () => {
    expect(await confirmAccountEmailCode({ ...input, code: "12ab" }, IP, NOW)).toEqual({ kind: "wrong_code", triesLeft: null });
  });
});
