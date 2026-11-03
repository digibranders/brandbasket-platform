import { afterEach, describe, expect, it, vi } from "vitest";
import { accountCodeSecret, emailCodeBypassed, leadsApiToken } from "./env";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("EMAIL_CODE_BYPASS", () => {
  it("works on the local app", () => {
    process.env.APP_ORIGIN = "http://localhost:3197";
    delete process.env.VERCEL_ENV;
    process.env.EMAIL_CODE_BYPASS = "true";
    expect(emailCodeBypassed()).toBe(true);
  });

  it("is refused where real customers can reach the app", () => {
    process.env.APP_ORIGIN = "https://app.brandbasket.in";
    delete process.env.VERCEL_ENV;
    process.env.EMAIL_CODE_BYPASS = "true";
    expect(emailCodeBypassed()).toBe(false);
  });

  it("stays off unless it is exactly true", () => {
    process.env.APP_ORIGIN = "http://localhost:3197";
    process.env.EMAIL_CODE_BYPASS = "yes";
    expect(emailCodeBypassed()).toBe(false);
  });
});

describe("accountCodeSecret", () => {
  const long = "k".repeat(40);

  it("is ACCOUNT_CODE_SECRET when set, over BOOKING_OTP_SECRET", () => {
    expect(accountCodeSecret({ ACCOUNT_CODE_SECRET: long, BOOKING_OTP_SECRET: "b".repeat(40) })).toBe(long);
  });

  it("falls back to BOOKING_OTP_SECRET", () => {
    expect(accountCodeSecret({ BOOKING_OTP_SECRET: long })).toBe(long);
    expect(accountCodeSecret({ ACCOUNT_CODE_SECRET: "  ", BOOKING_OTP_SECRET: long })).toBe(long);
  });

  it("refuses a missing or short secret, naming the setting, never the value", () => {
    expect(() => accountCodeSecret({})).toThrow(/ACCOUNT_CODE_SECRET/);
    expect(() => accountCodeSecret({ ACCOUNT_CODE_SECRET: "short-secret" })).toThrow(/at least 32/);
    expect(() => accountCodeSecret({ ACCOUNT_CODE_SECRET: "short-secret" })).not.toThrow(/short-secret/);
  });
});

describe("leadsApiToken", () => {
  it("is the token when it is long enough, and null otherwise", () => {
    process.env.LEADS_API_TOKEN = ` ${"t".repeat(32)} `;
    expect(leadsApiToken()).toBe("t".repeat(32));
    process.env.LEADS_API_TOKEN = "short";
    expect(leadsApiToken()).toBeNull();
    delete process.env.LEADS_API_TOKEN;
    expect(leadsApiToken()).toBeNull();
  });
});
