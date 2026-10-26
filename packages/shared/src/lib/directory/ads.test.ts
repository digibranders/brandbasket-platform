import { describe, expect, it } from "vitest";
import {
  adChargeDescription,
  adChargedPaise,
  formatAdDeadline,
  formatAdLastDay,
  isSoldPlacement,
  formatAdWeek,
  formatRupees,
  marketLabel,
  parseAdLink,
  parseAdPlacement,
  parseAdRupees,
  parseAdTagline,
} from "./ads";

describe("ad money", () => {
  it("charges the price as it stands: every price includes the 18% GST", () => {
    expect(adChargedPaise(71_000)).toBe(71_000);
    expect(adChargedPaise(29_900)).toBe(29_900);
  });

  it("formats rupees the Indian way", () => {
    expect(formatRupees(150_000)).toBe("₹1,500");
    expect(formatRupees(29_950)).toBe("₹299.50");
  });

  it("reads whole rupees in range and refuses the rest", () => {
    expect(parseAdRupees("1,500")).toBe(150_000);
    expect(parseAdRupees(" ₹ 750 ")).toBe(75_000);
    expect(parseAdRupees("99")).toBeNull();
    expect(parseAdRupees("100001")).toBeNull();
    expect(parseAdRupees("500.50")).toBeNull();
    expect(parseAdRupees("-500")).toBeNull();
    expect(parseAdRupees(null)).toBeNull();
  });
});

describe("ad wording", () => {
  it("names a market from the directory's lists", () => {
    expect(marketLabel({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" })).toBe("Dentists in Naupada, Thane");
    expect(marketLabel({ categorySlug: "made-up", citySlug: "thane", areaSlug: "nowhere" })).toBe("made-up in nowhere, Thane");
  });

  it("names a staff ad for all categories or all areas, and a city's home page market as just the city", () => {
    expect(marketLabel({ categorySlug: "all", citySlug: "thane", areaSlug: "naupada" })).toBe("All categories in Naupada, Thane");
    expect(marketLabel({ categorySlug: "dentists", citySlug: "thane", areaSlug: "all" })).toBe("Dentists in all areas of Thane");
    expect(marketLabel({ categorySlug: "all", citySlug: "thane", areaSlug: "all" })).toBe("Thane");
    expect(marketLabel({ categorySlug: "all", citySlug: "thane", areaSlug: "all" }, { home: false })).toBe("All categories in all areas of Thane");
  });

  it("formats a week and a deadline in Indian time", () => {
    expect(formatAdWeek("2026-10-05")).toBe("5 – 11 Oct");
    expect(formatAdWeek("2026-09-28")).toBe("28 Sept – 4 Oct");
    expect(formatAdDeadline(new Date("2026-10-03T14:30:00.000Z"))).toBe("Sat 3 Oct, 8:00 pm");
  });

  it("describes a won spot for the receipt", () => {
    expect(
      adChargeDescription({ placement: "side", spot: 2, weekStart: "2026-10-05", categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" }),
    ).toBe("Ad, side spot 2: Dentists in Naupada, Thane, 5 – 11 Oct");
  });
});

describe("ad forms", () => {
  it("reads a placement", () => {
    expect(parseAdPlacement("top")).toBe("top");
    expect(parseAdPlacement("middle")).toBeNull();
  });

  it("reads a tagline on one line, empty clearing it", () => {
    expect(parseAdTagline("  Open   on\nSundays ")).toEqual({ ok: true, tagline: "Open on Sundays" });
    expect(parseAdTagline("   ")).toEqual({ ok: true, tagline: null });
    expect(parseAdTagline("x".repeat(81))).toEqual({ ok: false, message: "Keep it to 80 characters." });
  });
});

describe("formatAdLastDay", () => {
  it("names the Sunday a week's ad shows until, from the week's end", () => {
    // The week of Monday 5 Oct ends when Monday 12 Oct begins in India (Sunday 18:30 UTC).
    expect(formatAdLastDay(new Date("2026-10-11T18:30:00.000Z"))).toBe("Sun 11 Oct");
  });

  it("refuses an invalid date", () => {
    expect(() => formatAdLastDay(new Date("nope"))).toThrow(RangeError);
  });
});

describe("isSoldPlacement", () => {
  it("sells the home page, side pictures and business page, and no longer the list's first row", () => {
    expect(["home", "side", "profile", "top"].map((placement) => isSoldPlacement(placement as "home"))).toEqual([true, true, true, false]);
  });
});

describe("parseAdLink", () => {
  it("accepts a web address and writes it as the browser would", () => {
    expect(parseAdLink("https://example.com/offer?x=1")).toEqual({ ok: true, url: "https://example.com/offer?x=1" });
    expect(parseAdLink("  http://shop.example.in ")).toEqual({ ok: true, url: "http://shop.example.in/" });
  });

  it("assumes https when no scheme is typed", () => {
    expect(parseAdLink("example.com/sale")).toEqual({ ok: true, url: "https://example.com/sale" });
  });

  it.each([
    ["", "Enter the address"],
    ["https://exa mple.com", "no spaces"],
    ["javascript:alert(1)", "https://"],
    ["ftp://example.com/file", "https://"],
    ["https://user:secret@example.com", "sign-in details"],
    ["https://localhost/offer", "web address"],
    ["https://", "web address"],
    [`https://example.com/${"a".repeat(500)}`, "500 characters"],
  ])("refuses %j", (value, message) => {
    const parsed = parseAdLink(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(message);
  });
});
