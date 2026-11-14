import { describe, expect, it } from "vitest";
import { openPendingSignup, sealPendingSignup, type PendingSignupPayload } from "./pending-signup-cookie";

const SECRET = "12345678901234567890123456789012"; // 32 characters
const NOW = 1_700_000_000_000;

const SAMPLE_PAYLOAD: Omit<PendingSignupPayload, "exp"> = {
  otp: {
    otpId: "0192f3c4-0000-7000-8000-000000000001",
    emailHint: "r***@example.com",
    confirmRequired: true,
  },
  input: {
    businessName: "Acme Corp",
    name: "Alice Smith",
    email: "alice@example.com",
    country: "IN",
    stateCode: "MH",
    phoneCountry: "IN",
    phone: "9820011223",
    password: "CorrectHorseBattery99!",
    agreed: true,
    choice: "managed",
    services: ["managed-website"],
    startToken: null,
    next: null,
  },
};

describe("sealPendingSignup and openPendingSignup", () => {
  it("seals and opens a pending sign-up payload correctly", () => {
    const sealed = sealPendingSignup(SAMPLE_PAYLOAD, SECRET, NOW);
    expect(typeof sealed).toBe("string");
    expect(sealed).not.toContain("Acme Corp"); // Encrypted, not plain JSON

    const opened = openPendingSignup(sealed, SECRET, NOW + 60_000); // 1 minute later
    expect(opened).not.toBeNull();
    expect(opened?.otp).toEqual(SAMPLE_PAYLOAD.otp);
    expect(opened?.input).toEqual(SAMPLE_PAYLOAD.input);
    expect(opened?.exp).toBe(NOW + 600 * 1000);
  });

  it("returns null when expired", () => {
    const sealed = sealPendingSignup(SAMPLE_PAYLOAD, SECRET, NOW);
    const opened = openPendingSignup(sealed, SECRET, NOW + 601 * 1000); // 601s later (past 10 min TTL)
    expect(opened).toBeNull();
  });

  it("returns null when opened with a different secret", () => {
    const sealed = sealPendingSignup(SAMPLE_PAYLOAD, SECRET, NOW);
    const otherSecret = "abcdefghijklmnopqrstuvwxyz123456";
    expect(openPendingSignup(sealed, otherSecret, NOW)).toBeNull();
  });

  it("returns null for tampered ciphertext", () => {
    const sealed = sealPendingSignup(SAMPLE_PAYLOAD, SECRET, NOW);
    const tampered = sealed.slice(0, -4) + "AAAA";
    expect(openPendingSignup(tampered, SECRET, NOW)).toBeNull();
  });

  it("returns null for empty or malformed input", () => {
    expect(openPendingSignup("", SECRET, NOW)).toBeNull();
    expect(openPendingSignup("not-valid-base64-token", SECRET, NOW)).toBeNull();
  });
});
