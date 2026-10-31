import { describe, expect, it } from "vitest";
import { adResultsHref, adResultsWindow, readAdResultsDays } from "./ad-results";

describe("readAdResultsDays", () => {
  it("defaults to 30 days, and takes only the windows the page offers", () => {
    expect(readAdResultsDays({})).toBe(30);
    expect(readAdResultsDays({ days: "7" })).toBe(7);
    expect(readAdResultsDays({ days: "365" })).toBe(365);
    for (const bad of ["0", "31", "-7", "abc", "", ["7", "30"]]) expect(readAdResultsDays({ days: bad })).toBe(30);
  });
});

describe("adResultsWindow", () => {
  it("runs from that many days before now up to now", () => {
    const now = new Date("2026-11-10T06:30:00Z");
    expect(adResultsWindow(now, 7)).toEqual({ from: new Date("2026-11-03T06:30:00Z"), to: now });
  });
});

describe("adResultsHref", () => {
  it("leaves the default window off the address", () => {
    expect(adResultsHref(30)).toBe("/ad-results");
    expect(adResultsHref(90)).toBe("/ad-results?days=90");
  });
});
