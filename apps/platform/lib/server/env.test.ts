import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountCodeSecret,
  bookingOtpBypassed,
  emailCodeBypassed,
  googleBusinessCredentials,
  signupOtpBypassed,
  smsAllowedCountryCodes,
  smsProviderName,
  verifyOtpBypassed,
} from "./env";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("smsProviderName", () => {
  it("defaults to outbox when unset", () => {
    delete process.env.SMS_PROVIDER;
    expect(smsProviderName()).toBe("outbox");
  });

  it("treats a blank value the same as unset", () => {
    process.env.SMS_PROVIDER = "";
    expect(smsProviderName()).toBe("outbox");
  });

  it("treats a whitespace-only value the same as unset", () => {
    process.env.SMS_PROVIDER = "   ";
    expect(smsProviderName()).toBe("outbox");
  });

  it("returns a set value, trimmed", () => {
    process.env.SMS_PROVIDER = "  twilio  ";
    expect(smsProviderName()).toBe("twilio");
  });
});

describe("smsAllowedCountryCodes", () => {
  it("defaults to India only when unset", () => {
    delete process.env.SMS_ALLOWED_COUNTRY_CODES;
    expect(smsAllowedCountryCodes()).toEqual(["91"]);
  });

  it("defaults to India only when blank", () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = "";
    expect(smsAllowedCountryCodes()).toEqual(["91"]);
  });

  it("parses a comma-separated list, trimming each code", () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = "91, 1 ,44";
    expect(smsAllowedCountryCodes()).toEqual(["91", "1", "44"]);
  });

  it("falls back to the default when the list is only separators/whitespace", () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = " , , ";
    expect(smsAllowedCountryCodes()).toEqual(["91"]);
  });
});

describe("bookingOtpSecret", () => {
  it("throws a clear error when unset", async () => {
    delete process.env.BOOKING_OTP_SECRET;
    const fresh = await import("./env");
    expect(() => fresh.bookingOtpSecret()).toThrow(/Invalid booking configuration/);
  });

  it("throws when shorter than 32 characters", async () => {
    process.env.BOOKING_OTP_SECRET = "too-short";
    const fresh = await import("./env");
    expect(() => fresh.bookingOtpSecret()).toThrow(/at least 32 characters/);
  });

  it("returns a valid secret", async () => {
    process.env.BOOKING_OTP_SECRET = "s".repeat(32);
    const fresh = await import("./env");
    expect(fresh.bookingOtpSecret()).toBe("s".repeat(32));
  });
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

describe("OTP bypass switches", () => {
  const switches = [
    ["BOOKING_OTP_BYPASS", () => bookingOtpBypassed()],
    ["SIGNUP_OTP_BYPASS", () => signupOtpBypassed()],
    ["VERIFY_OTP_BYPASS", () => verifyOtpBypassed()],
    ["EMAIL_CODE_BYPASS", () => emailCodeBypassed()],
  ] as const;

  it.each(switches)("%s works on the local dashboard", (name, read) => {
    process.env.APP_ORIGIN = "http://app.localhost:3001";
    delete process.env.VERCEL_ENV;
    process.env[name] = "true";
    expect(read()).toBe(true);
  });

  it.each(switches)("%s is refused where real customers can reach the app", (name, read) => {
    process.env.APP_ORIGIN = "https://app.fynix.digital";
    delete process.env.VERCEL_ENV;
    process.env[name] = "true";
    expect(read()).toBe(false);
  });

  it.each(switches)("%s stays off unless it is exactly true", (name, read) => {
    process.env.APP_ORIGIN = "http://app.localhost:3001";
    process.env[name] = "yes";
    expect(read()).toBe(false);
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
