import { describe, expect, it } from "vitest";
import { HIT_BODY_LIMIT, HIT_KINDS, parseHit } from "./payload";

const KEY = "bbk_abcdefghijklmnop";
const ok = (body: Record<string, unknown>) => parseHit(JSON.stringify({ key: KEY, kind: "pageview", path: "/", ...body }));

describe("parseHit", () => {
  it("lists the event kinds the script may send", () => {
    expect(HIT_KINDS).toEqual(["pageview", "engagement", "call", "whatsapp", "email", "directions", "social", "outbound", "download", "form", "custom"]);
  });

  it("reads a page view and tidies every field", () => {
    expect(ok({ path: "/About/?x=1", ref: "https://www.google.com/search?q=x", source: " Google ", medium: "CPC", campaign: "Diwali Offer" })).toEqual({
      key: KEY,
      kind: "pageview",
      path: "/about",
      referrerHost: "google.com",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "diwali offer",
      label: null,
      engagedMs: null,
      scrollPct: null,
    });
  });

  it("reads an engagement report", () => {
    expect(ok({ kind: "engagement", engagedMs: 42_000, scrollPct: 80 })).toMatchObject({ kind: "engagement", engagedMs: 42_000, scrollPct: 80 });
  });

  it("keeps a tap's label as a lower-case host or name", () => {
    expect(ok({ kind: "outbound", label: "Justdial.com" })).toMatchObject({ label: "justdial.com" });
    expect(ok({ kind: "custom", label: "book-now" })).toMatchObject({ label: "book-now" });
  });

  it("needs a good name on a custom event", () => {
    expect(ok({ kind: "custom" })).toBeNull();
    expect(ok({ kind: "custom", label: "Book Now!" })).toBeNull();
  });

  it("refuses a bad key, an unknown kind, a missing or unusable path", () => {
    expect(ok({ key: "abc" })).toBeNull();
    expect(ok({ key: "bbk_short" })).toBeNull();
    expect(ok({ kind: "purchase" })).toBeNull();
    expect(parseHit(JSON.stringify({ key: KEY, kind: "pageview" }))).toBeNull();
    expect(ok({ path: "" })).toBeNull();
  });

  it("refuses numbers out of range", () => {
    expect(ok({ kind: "engagement", engagedMs: -1 })).toBeNull();
    expect(ok({ kind: "engagement", engagedMs: 1_800_001 })).toBeNull();
    expect(ok({ kind: "engagement", scrollPct: 101 })).toBeNull();
    expect(ok({ kind: "engagement", engagedMs: 1.5 })).toBeNull();
  });

  it("refuses any field it does not know, so nothing personal can ride along", () => {
    expect(ok({ email: "asha@example.com" })).toBeNull();
  });

  it("refuses text that is not a JSON object, or is too long", () => {
    expect(parseHit("nope")).toBeNull();
    expect(parseHit("[]")).toBeNull();
    expect(parseHit("null")).toBeNull();
    expect(parseHit(" ".repeat(HIT_BODY_LIMIT + 1))).toBeNull();
  });
});
