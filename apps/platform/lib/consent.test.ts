import { describe, expect, it } from "vitest";
import { consentSignals, decodeRecord, encodeRecord, isUntrackedPath, measurementCookies, parseGtmId } from "./consent";

const NOW = new Date("2026-10-31T10:00:00.000Z");

describe("parseGtmId", () => {
  it("returns null when the variable is unset or blank", () => {
    expect(parseGtmId({})).toBeNull();
    expect(parseGtmId({ NEXT_PUBLIC_GTM_ID: "  " })).toBeNull();
  });

  it("accepts a container id, trimmed", () => {
    expect(parseGtmId({ NEXT_PUBLIC_GTM_ID: " GTM-57VWMSJ8 " })).toBe("GTM-57VWMSJ8");
  });

  it("throws naming the variable for a malformed id", () => {
    expect(() => parseGtmId({ NEXT_PUBLIC_GTM_ID: "G-ZJFQXB5QF3" })).toThrow(/NEXT_PUBLIC_GTM_ID/);
    expect(() => parseGtmId({ NEXT_PUBLIC_GTM_ID: "gtm-abc" })).toThrow(/not a valid container id/);
  });
});

describe("consent record", () => {
  it("round-trips a choice", () => {
    expect(decodeRecord(encodeRecord(true, NOW), NOW)).toEqual({ measurement: true, at: NOW.toISOString() });
    expect(decodeRecord(encodeRecord(false, NOW), NOW)?.measurement).toBe(false);
  });

  it("asks again when nothing usable is stored", () => {
    expect(decodeRecord(null, NOW)).toBeNull();
    expect(decodeRecord("not json", NOW)).toBeNull();
    expect(decodeRecord(JSON.stringify({ measurement: "yes", at: NOW.toISOString() }), NOW)).toBeNull();
  });

  it("asks again after 12 months", () => {
    const raw = encodeRecord(true, new Date("2025-10-01T00:00:00.000Z"));
    expect(decodeRecord(raw, NOW)).toBeNull();
    expect(decodeRecord(raw, new Date("2026-09-30T00:00:00.000Z"))).not.toBeNull();
  });
});

describe("consentSignals", () => {
  it("grants analytics storage only when measurement is allowed", () => {
    expect(consentSignals(true).analytics_storage).toBe("granted");
    expect(consentSignals(false).analytics_storage).toBe("denied");
  });

  it("never grants an advertising signal", () => {
    const { ad_storage, ad_user_data, ad_personalization } = consentSignals(true);
    expect([ad_storage, ad_user_data, ad_personalization]).toEqual(["denied", "denied", "denied"]);
  });
});

describe("isUntrackedPath", () => {
  it("skips pages whose address holds a one-time secret", () => {
    for (const path of ["/reset-password/abc123", "/confirm-email/abc123", "/setup/abc123", "/billing/confirm", "/billing/charges/confirm"]) {
      expect(isUntrackedPath(path), path).toBe(true);
    }
  });

  it("tracks every other page", () => {
    for (const path of ["/", "/login", "/join", "/settings/privacy", "/billing", "/billing/pay", "/requests/new"]) {
      expect(isUntrackedPath(path), path).toBe(false);
    }
  });
});

describe("measurementCookies", () => {
  it("picks Google Analytics and Clarity cookies and leaves the rest", () => {
    expect(measurementCookies(["_ga", "_ga_ZJFQXB5QF3", "_clck", "_clsk", "better-auth.session_token", "bb-theme"])).toEqual(["_ga", "_ga_ZJFQXB5QF3", "_clck", "_clsk"]);
  });
});
