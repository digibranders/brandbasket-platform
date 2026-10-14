import { describe, expect, it, vi } from "vitest";
import { generateOtpCode, hashOtpCode, otpCodeMatches } from "./otp-crypto";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(32);

describe("generateOtpCode", () => {
  it("always returns exactly 6 digits", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtpCode();
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });
});

describe("hashOtpCode / otpCodeMatches", () => {
  it("matches the same otpId and code", () => {
    const hash = hashOtpCode("otp-1", "482913", SECRET);
    expect(otpCodeMatches(hash, "otp-1", "482913", SECRET)).toBe(true);
  });

  it("does not match a different code", () => {
    const hash = hashOtpCode("otp-1", "482913", SECRET);
    expect(otpCodeMatches(hash, "otp-1", "482914", SECRET)).toBe(false);
  });

  it("does not match when the otpId differs (the hash is salted per-OTP)", () => {
    const hash = hashOtpCode("otp-1", "482913", SECRET);
    expect(otpCodeMatches(hash, "otp-2", "482913", SECRET)).toBe(false);
  });

  it("produces different hashes for the same code under two different otpIds", () => {
    const hashA = hashOtpCode("otp-1", "482913", SECRET);
    const hashB = hashOtpCode("otp-2", "482913", SECRET);
    expect(hashA).not.toBe(hashB);
  });

  it("does not match a different secret", () => {
    const hash = hashOtpCode("otp-1", "482913", SECRET);
    expect(otpCodeMatches(hash, "otp-1", "482913", "t".repeat(32))).toBe(false);
  });

  it("treats a malformed stored hash as no match rather than throwing", () => {
    expect(otpCodeMatches("not-hex", "otp-1", "482913", SECRET)).toBe(false);
  });
});
