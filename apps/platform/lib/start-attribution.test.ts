import { describe, expect, it } from "vitest";
import { sealStart, type Attribution } from "@/lib/start-token";
import { START_FIELD } from "@/lib/join-form";
import { attributionFromStart } from "./start-attribution";

const SECRET = "k".repeat(40);
const NOW = 1_800_000_000_000;
const PREFILL = { name: "Rahul Mehta", email: "rahul@mehta.in", phone: "9876543210" };
const ATTR: Attribution = {
  values: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "diwali", fbclid: "IwAR0", fbp: "fb.1.1.2", ga_client_id: "1.2", landing_path: "/start", referrer_host: "l.facebook.com" },
  consentMeasurement: true,
  consentAdvertising: false,
};

function form(token: string | null): FormData {
  const data = new FormData();
  if (token !== null) data.set(START_FIELD, token);
  return data;
}

describe("attributionFromStart", () => {
  it("reads the ad a sign-up came from out of the sealed field, in the database's words", () => {
    expect(attributionFromStart(form(sealStart({ ...PREFILL, attr: ATTR }, SECRET, NOW)), SECRET, NOW + 1000)).toEqual({
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "diwali",
      utmTerm: null,
      utmContent: null,
      gclid: null,
      fbclid: "IwAR0",
      fbp: "fb.1.1.2",
      fbc: null,
      gaClientId: "1.2",
      gaSessionId: null,
      landingPath: "/start",
      referrerHost: "l.facebook.com",
      consentMeasurement: true,
      consentAdvertising: false,
    });
  });

  it("is null when there is no field, no secret, a token that is not one, an old one, or one without an ad", () => {
    const token = sealStart({ ...PREFILL, attr: ATTR }, SECRET, NOW);
    expect(attributionFromStart(form(null), SECRET, NOW)).toBeNull();
    expect(attributionFromStart(form(token), null, NOW)).toBeNull();
    expect(attributionFromStart(form("not a token"), SECRET, NOW)).toBeNull();
    expect(attributionFromStart(form(token), SECRET, NOW + 2 * 60 * 60 * 1000)).toBeNull();
    expect(attributionFromStart(form(sealStart(PREFILL, SECRET, NOW)), SECRET, NOW)).toBeNull();
  });
});
