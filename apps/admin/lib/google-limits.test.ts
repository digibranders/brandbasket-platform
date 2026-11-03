import { describe, expect, it } from "vitest";
import { analyticsCountLine, isNearSearchConsoleLimit, searchConsoleCountLine, searchConsoleFillPercent, searchConsoleLimitText } from "./google-limits";

describe("Google account limits", () => {
  it("warns from 800 Search Console sites and not before", () => {
    expect(isNearSearchConsoleLimit(799)).toBe(false);
    expect(isNearSearchConsoleLimit(800)).toBe(true);
    expect(isNearSearchConsoleLimit(1000)).toBe(true);
  });

  it("fills the meter in proportion and never past the end", () => {
    expect(searchConsoleFillPercent(812)).toBeCloseTo(81.2);
    expect(searchConsoleFillPercent(1200)).toBe(100);
    expect(searchConsoleFillPercent(-1)).toBe(0);
  });

  it("words the counts and the amber callout as the approved mock does", () => {
    expect(searchConsoleCountLine(312)).toBe("312 of 1,000");
    expect(analyticsCountLine(298)).toBe("298 of 2,000");
    expect(searchConsoleLimitText(812)).toBe(
      "This account holds 812 Search Console sites, close to Google's limit of 1,000. Create the second Google account and set google_slot to 2 for new sites. Nothing stops working at 812.",
    );
    expect(searchConsoleLimitText(812)).not.toMatch(/[–—]/);
  });
});
