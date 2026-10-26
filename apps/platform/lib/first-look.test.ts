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
  const now = Date.parse("2026-10-26T10:00:00.000Z");
  const base = { hasAccess: true, websiteLive: false, setupSent: false, callEndsAtIso: null, nowMs: now };

  it("holds until the kickoff call has ended", () => {
    expect(inFirstLook(base)).toBe(true);
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-27T09:00:00.000Z" })).toBe(true);
    expect(inFirstLook({ ...base, callEndsAtIso: "2026-10-26T09:00:00.000Z" })).toBe(false);
  });

  it("ends once the website is live", () => {
    expect(inFirstLook({ ...base, websiteLive: true })).toBe(false);
  });

  it("ends once the setup has been sent", () => {
    expect(inFirstLook({ ...base, setupSent: true })).toBe(false);
  });

  it("never applies to an account that has not paid or has lapsed, even with no call booked", () => {
    expect(inFirstLook({ ...base, hasAccess: false })).toBe(false);
    expect(inFirstLook({ ...base, hasAccess: false, callEndsAtIso: "2026-10-27T09:00:00.000Z" })).toBe(false);
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
