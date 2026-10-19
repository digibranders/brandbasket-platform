import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountCodeSecret, emailCodeBypassed, googleBusinessCredentials } from "./env";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("googleBusinessCredentials", () => {
  it("is null while neither variable is set", () => {
    delete process.env.GOOGLE_BUSINESS_CLIENT_ID;
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET = "  ";
    expect(googleBusinessCredentials()).toBeNull();
  });

  it("returns both, trimmed, when both are set", () => {
    process.env.GOOGLE_BUSINESS_CLIENT_ID = " client.apps.googleusercontent.com ";
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET = " secret ";
    expect(googleBusinessCredentials()).toEqual({ clientId: "client.apps.googleusercontent.com", clientSecret: "secret" });
  });

  it("throws when only one is set", () => {
    process.env.GOOGLE_BUSINESS_CLIENT_ID = "client.apps.googleusercontent.com";
    delete process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
    expect(() => googleBusinessCredentials()).toThrow(/set both/);
  });
});

describe("EMAIL_CODE_BYPASS", () => {
  it("works on the local dashboard", () => {
    process.env.APP_ORIGIN = "http://app.localhost:3001";
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
    process.env.APP_ORIGIN = "http://app.localhost:3001";
    process.env.EMAIL_CODE_BYPASS = "yes";
    expect(emailCodeBypassed()).toBe(false);
  });

  it("is no longer read from the retired text-message switches", () => {
    process.env.APP_ORIGIN = "http://app.localhost:3001";
    delete process.env.EMAIL_CODE_BYPASS;
    for (const retired of ["BOOKING_OTP_BYPASS", "SIGNUP_OTP_BYPASS", "VERIFY_OTP_BYPASS"]) process.env[retired] = "true";
    expect(emailCodeBypassed()).toBe(false);
  });
});

describe("accountCodeSecret", () => {
  const long = "k".repeat(40);

  it("is ACCOUNT_CODE_SECRET when set, over BOOKING_OTP_SECRET", () => {
    expect(accountCodeSecret({ ACCOUNT_CODE_SECRET: long, BOOKING_OTP_SECRET: "b".repeat(40) })).toBe(long);
  });

  it("falls back to BOOKING_OTP_SECRET, so a deployment that already has one needs nothing more", () => {
    expect(accountCodeSecret({ BOOKING_OTP_SECRET: long })).toBe(long);
    expect(accountCodeSecret({ ACCOUNT_CODE_SECRET: "  ", BOOKING_OTP_SECRET: long })).toBe(long);
  });

  it("refuses a missing or short secret, naming the setting, never the value", () => {
    expect(() => accountCodeSecret({})).toThrow(/ACCOUNT_CODE_SECRET/);
    expect(() => accountCodeSecret({ ACCOUNT_CODE_SECRET: "short-secret" })).toThrow(/at least 32/);
    try {
      accountCodeSecret({ ACCOUNT_CODE_SECRET: "short-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret");
    }
  });
});
