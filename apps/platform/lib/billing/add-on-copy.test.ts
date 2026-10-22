import { describe, expect, it } from "vitest";
import { addOnDate } from "./add-on-copy";

const NOV_12 = new Date("2026-11-12T04:30:00Z");
/** Late on the 11th in UTC is already the 12th in India. */
const LATE_UTC = new Date("2026-11-11T23:30:00Z");

describe("addOnDate", () => {
  it("reads like 12 November 2026, in India time", () => {
    expect(addOnDate(NOV_12)).toBe("12 November 2026");
    expect(addOnDate(LATE_UTC)).toBe("12 November 2026");
  });
});
