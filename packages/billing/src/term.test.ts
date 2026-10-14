import { describe, expect, it } from "vitest";
import { addMonthsUtc } from "./term";

describe("addMonthsUtc", () => {
  it("adds calendar months and keeps the time of day", () => {
    expect(addMonthsUtc(new Date("2026-03-01T10:30:00.000Z"), 3)).toEqual(new Date("2026-06-01T10:30:00.000Z"));
    expect(addMonthsUtc(new Date("2026-09-16T08:00:00.000Z"), 1)).toEqual(new Date("2026-10-16T08:00:00.000Z"));
  });

  it("crosses the year end", () => {
    expect(addMonthsUtc(new Date("2026-11-20T00:00:00.000Z"), 3)).toEqual(new Date("2027-02-20T00:00:00.000Z"));
  });

  it("clamps to the end of a shorter month instead of rolling into the next", () => {
    expect(addMonthsUtc(new Date("2026-01-31T09:00:00.000Z"), 1)).toEqual(new Date("2026-02-28T09:00:00.000Z"));
    expect(addMonthsUtc(new Date("2028-01-31T09:00:00.000Z"), 1)).toEqual(new Date("2028-02-29T09:00:00.000Z"));
    expect(addMonthsUtc(new Date("2026-08-31T09:00:00.000Z"), 3)).toEqual(new Date("2026-11-30T09:00:00.000Z"));
  });

  it("returns the same instant for zero months without mutating the input", () => {
    const from = new Date("2026-05-31T23:59:59.999Z");
    const result = addMonthsUtc(from, 0);
    expect(result).toEqual(from);
    expect(result).not.toBe(from);
  });

  it.each([-1, 1.5, Number.NaN])("refuses %s months", (months) => {
    expect(() => addMonthsUtc(new Date(), months)).toThrow(RangeError);
  });

  it("refuses an invalid date", () => {
    expect(() => addMonthsUtc(new Date("nope"), 1)).toThrow(RangeError);
  });
});
