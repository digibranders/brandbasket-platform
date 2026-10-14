import { describe, expect, it } from "vitest";
import { isOtpCode, OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "./otp";

describe("constants", () => {
  it("match the documented policy (6 digits, 10 minutes, 5 tries)", () => {
    expect(OTP_LENGTH).toBe(6);
    expect(OTP_TTL_SECONDS).toBe(600);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe("isOtpCode", () => {
  it("accepts exactly 6 digits", () => {
    expect(isOtpCode("123456")).toBe(true);
    expect(isOtpCode("000000")).toBe(true);
  });

  it("rejects a code that is too short or too long", () => {
    expect(isOtpCode("12345")).toBe(false);
    expect(isOtpCode("1234567")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isOtpCode("12345a")).toBe(false);
    expect(isOtpCode("123 456")).toBe(false);
    expect(isOtpCode("-23456")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isOtpCode("")).toBe(false);
  });
});
