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

  it("holds until the kickoff call has ended", () => {
    expect(inFirstLook({ websiteSent: false, callEndsAtIso: null, nowMs: now })).toBe(true);
    expect(inFirstLook({ websiteSent: false, callEndsAtIso: "2026-10-27T09:00:00.000Z", nowMs: now })).toBe(true);
    expect(inFirstLook({ websiteSent: false, callEndsAtIso: "2026-10-26T09:00:00.000Z", nowMs: now })).toBe(false);
  });

  it("never applies once the website has been sent or is live", () => {
    expect(inFirstLook({ websiteSent: true, callEndsAtIso: null, nowMs: now })).toBe(false);
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
