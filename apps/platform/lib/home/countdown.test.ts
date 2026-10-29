import { describe, expect, it } from "vitest";
import { countdownBlocks, countdownLabel } from "@/lib/home/countdown";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("countdownBlocks", () => {
  it("shows days and hours from a day out", () => {
    expect(countdownBlocks(2 * DAY + 5 * HOUR + 59 * MIN)).toEqual([{ value: 2, unit: "day" }, { value: 5, unit: "hour" }]);
    expect(countdownBlocks(DAY)).toEqual([{ value: 1, unit: "day" }, { value: 0, unit: "hour" }]);
  });

  it("shows hours and minutes under a day, and minutes only under an hour", () => {
    expect(countdownBlocks(DAY - MIN)).toEqual([{ value: 23, unit: "hour" }, { value: 59, unit: "minute" }]);
    expect(countdownBlocks(3 * HOUR + 18 * MIN)).toEqual([{ value: 3, unit: "hour" }, { value: 18, unit: "minute" }]);
    expect(countdownBlocks(HOUR - MIN)).toEqual([{ value: 59, unit: "minute" }]);
    expect(countdownBlocks(MIN)).toEqual([{ value: 1, unit: "minute" }]);
  });

  it("rounds down and never shows seconds", () => {
    expect(countdownBlocks(5 * MIN + 59_999)).toEqual([{ value: 5, unit: "minute" }]);
  });

  it("is empty, never negative, once under a minute is left or the time has passed", () => {
    expect(countdownBlocks(59_999)).toEqual([]);
    expect(countdownBlocks(0)).toEqual([]);
    expect(countdownBlocks(-5 * HOUR)).toEqual([]);
  });
});

describe("countdownLabel", () => {
  it("says it in words with the right plurals", () => {
    expect(countdownLabel(DAY + HOUR)).toBe("1 day and 1 hour");
    expect(countdownLabel(2 * DAY)).toBe("2 days and 0 hours");
    expect(countdownLabel(3 * HOUR + 18 * MIN)).toBe("3 hours and 18 minutes");
    expect(countdownLabel(18 * MIN)).toBe("18 minutes");
    expect(countdownLabel(MIN)).toBe("1 minute");
  });

  it("says 'now' when nothing is left", () => {
    expect(countdownLabel(0)).toBe("now");
    expect(countdownLabel(-1)).toBe("now");
  });
});
