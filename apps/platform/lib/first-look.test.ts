import { describe, expect, it } from "vitest";
import { andList, inFirstLook, servicesBought, serviceWords } from "@/lib/first-look";

const line = (addOn: string, status = "active", endRequestedAt: Date | null = null) => ({ addOn, status, endRequestedAt });

describe("servicesBought", () => {
  it("lists paid services in catalogue order", () => {
    expect(servicesBought([line("local-seo-aeo"), line("managed-website"), line("digital-growth")])).toEqual(["website", "social", "search"]);
  });

  it("leaves out pending lines and lines on their way out", () => {
    expect(servicesBought([line("managed-website", "pending"), line("digital-growth", "active", new Date())])).toEqual([]);
  });
});

describe("inFirstLook", () => {
  const NOW = Date.parse("2026-10-28T10:00:00.000Z");
  const base = { hasAccess: true, websiteLive: false, setupSent: false, callHeld: false, callEndsAtIso: null, nowMs: NOW } as const;

  it("holds until the call has been marked held, with or without a booking", () => {
    expect(inFirstLook(base)).toBe(true);
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-29T09:00:00.000Z" })).toBe(true);
  });

  it("ends when staff mark the call held", () => {
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-27T09:00:00.000Z", callHeld: true })).toBe(false);
  });

  it("ends two days after the call's end time when nobody marked it, so a forgotten click never locks a customer in", () => {
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-27T09:00:00.000Z" })).toBe(true); // 25 hours after: still inside the grace
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-26T09:00:00.000Z" })).toBe(false); // 49 hours after
  });

  it("never applies to an account that has not paid, or once the website is sent or live", () => {
    expect(inFirstLook({ ...base, hasAccess: false })).toBe(false);
    expect(inFirstLook({ ...base, websiteLive: true })).toBe(false);
    expect(inFirstLook({ ...base, setupSent: true })).toBe(false);
  });
});

describe("words", () => {
  it("joins names the way a sentence does", () => {
    expect(andList([])).toBe("");
    expect(andList(["Website"])).toBe("Website");
    expect(andList(["Website", "Search"])).toBe("Website and Search");
    expect(andList(["Website", "Social & Ads", "Search"])).toBe("Website, Social & Ads and Search");
  });

  it("says what the call plans", () => {
    expect(serviceWords(["website", "social", "search"])).toBe("website, social and search");
  });
});
