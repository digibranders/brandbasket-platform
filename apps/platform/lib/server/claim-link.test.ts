import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimedBusinessName, claimSignaturePayload } from "@/lib/directory-api";
import { hasValidClaimSignature } from "./claim-link";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const KEY = "dentists/thane/naupada/smile-dental";
const NAME = "Smile Dental";
const PLACE_ID = "k7m2q9a";

/** What the website's server does to make a claim link. */
function sign(business: string, name: string, token = TOKEN): string {
  return createHmac("sha256", token).update(claimSignaturePayload(business, name)).digest("base64url");
}

beforeEach(() => {
  vi.stubEnv("LEADS_API_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasValidClaimSignature", () => {
  it("accepts the listing and name the website signed", () => {
    expect(hasValidClaimSignature(KEY, NAME, sign(KEY, NAME))).toBe(true);
  });

  it("refuses a name changed in the address bar", () => {
    expect(hasValidClaimSignature(KEY, "Best Dentist In Thane", sign(KEY, NAME))).toBe(false);
  });

  it("refuses a signature moved to another listing", () => {
    expect(hasValidClaimSignature("dentists/thane/naupada/care-dental", NAME, sign(KEY, NAME))).toBe(false);
  });

  it("refuses a signature made with another secret, a missing one, and junk", () => {
    expect(hasValidClaimSignature(KEY, NAME, sign(KEY, NAME, "x".repeat(40)))).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, "")).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, "not-a-signature")).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, "a".repeat(500))).toBe(false);
  });

  it("accepts the place id the website signed, in the same position and format as a key", () => {
    expect(hasValidClaimSignature(PLACE_ID, NAME, sign(PLACE_ID, NAME))).toBe(true);
    // The canonical string, so the website can sign the same bytes.
    const canonical = createHmac("sha256", TOKEN).update(`claim\n${PLACE_ID}\n${NAME}`).digest("base64url");
    expect(hasValidClaimSignature(PLACE_ID, NAME, canonical)).toBe(true);
  });

  it("refuses an id changed in the address bar, a name changed under an id, and an id signed for another business", () => {
    expect(hasValidClaimSignature("b3cdefg", NAME, sign(PLACE_ID, NAME))).toBe(false);
    expect(hasValidClaimSignature(PLACE_ID, "Best Dentist In Thane", sign(PLACE_ID, NAME))).toBe(false);
    expect(hasValidClaimSignature(PLACE_ID, NAME, sign(KEY, NAME))).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, sign(PLACE_ID, NAME))).toBe(false);
  });

  it("refuses a signature written any other way than the canonical base64url, even when it decodes to the same bytes", () => {
    const good = sign(KEY, NAME);
    // The last character of a 43-character base64url string carries two unused bits: another character decodes to the same bytes.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = good.slice(-1);
    const variants = [...alphabet].filter((char) => char !== last && Buffer.from(good.slice(0, -1) + char, "base64url").equals(Buffer.from(good, "base64url")));
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) expect(hasValidClaimSignature(KEY, NAME, good.slice(0, -1) + variant)).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, `${good}=`)).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, `${good.slice(0, 10)}!${good.slice(10)}`)).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, `${good.slice(0, 10)}\n${good.slice(10)}`)).toBe(false);
    expect(hasValidClaimSignature(KEY, NAME, good)).toBe(true);
  });

  it("trusts no claim when the shared secret is not configured", () => {
    vi.stubEnv("LEADS_API_TOKEN", "");
    expect(hasValidClaimSignature(KEY, NAME, sign(KEY, NAME))).toBe(false);
    expect(hasValidClaimSignature(PLACE_ID, NAME, sign(PLACE_ID, NAME))).toBe(false);
  });
});

describe("claimedBusinessName", () => {
  it("makes one clean line of at most 200 characters", () => {
    expect(claimedBusinessName("  Smile\n Dental\u0007  Clinic ")).toBe("Smile Dental Clinic");
    expect(claimedBusinessName("a".repeat(250))).toHaveLength(200);
  });
});
