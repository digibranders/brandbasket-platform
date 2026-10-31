import { describe, expect, it } from "vitest";
import { cleanAttribution, openStart, sealStart, type Attribution } from "./start-token";

const SECRET = "k".repeat(40);
const PREFILL = { name: "Rahul Mehta", email: "rahul@mehta.in", phone: "9876543210" };
const NOW = 1_800_000_000_000;
const ATTRIBUTION: Attribution = {
  values: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "diwali", fbclid: "IwAR0abc", landing_path: "/start" },
  consentMeasurement: true,
  consentAdvertising: false,
};

describe("start token", () => {
  it("opens what it sealed", () => {
    expect(openStart(sealStart(PREFILL, SECRET, NOW), SECRET, NOW + 1000)).toEqual(PREFILL);
  });

  it("never shows the details in the token", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("rahul");
  });

  it("is refused after an hour", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(openStart(token, SECRET, NOW + 60 * 60 * 1000 - 1)).toEqual(PREFILL);
    expect(openStart(token, SECRET, NOW + 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("is refused under another secret, when altered, and when it is not a token", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(openStart(token, "z".repeat(40), NOW)).toBeNull();
    const flipped = Buffer.from(token, "base64url");
    flipped[flipped.length - 1] ^= 1;
    expect(openStart(flipped.toString("base64url"), SECRET, NOW)).toBeNull();
    for (const junk of ["", "abc", "not a token at all", "A".repeat(200)]) expect(openStart(junk, SECRET, NOW)).toBeNull();
  });

  it("carries the ad attribution through and keeps it out of the readable token", () => {
    const token = sealStart({ ...PREFILL, attr: ATTRIBUTION }, SECRET, NOW);
    expect(openStart(token, SECRET, NOW + 1000)).toEqual({ ...PREFILL, attr: ATTRIBUTION });
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("diwali");
  });

  it("opens a token made without attribution, with none", () => {
    const opened = openStart(sealStart(PREFILL, SECRET, NOW), SECRET, NOW);
    expect(opened).toEqual(PREFILL);
    expect(opened).not.toHaveProperty("attr");
  });

  it("still opens the details when the attribution inside is unusable", () => {
    const token = sealStart({ ...PREFILL, attr: { values: { utm_source: 5 }, consentMeasurement: "yes" } as unknown as Attribution }, SECRET, NOW);
    expect(openStart(token, SECRET, NOW)).toEqual(PREFILL);
  });
});

describe("cleanAttribution", () => {
  it("keeps the known keys, trimmed, and reads consent only when it is exactly true", () => {
    expect(cleanAttribution({ values: { utm_source: "  meta ", gclid: "abc" }, consentMeasurement: true, consentAdvertising: "true" })).toEqual({
      values: { utm_source: "meta", gclid: "abc" },
      consentMeasurement: true,
      consentAdvertising: false,
    });
  });

  it("drops unknown keys, non-text, empty, over-long and control-character values", () => {
    const cleaned = cleanAttribution({
      values: { utm_source: "meta", utm_medium: 7, utm_campaign: "   ", utm_term: "x".repeat(121), utm_content: "a\nb", email: "a@b.in", fbp: "x".repeat(61) },
      consentMeasurement: false,
      consentAdvertising: false,
    });
    expect(cleaned).toEqual({ values: { utm_source: "meta" }, consentMeasurement: false, consentAdvertising: false });
  });

  it("is null when nothing usable is left, or the input is not an attribution", () => {
    expect(cleanAttribution({ values: { utm_source: "" }, consentMeasurement: true, consentAdvertising: true })).toBeNull();
    for (const junk of [undefined, null, "meta", 5, [], { values: "meta" }, {}]) expect(cleanAttribution(junk)).toBeNull();
  });
});
