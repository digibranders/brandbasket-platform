// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatPaymentDay } from "./payment-day";

describe("formatPaymentDay", () => {
  const now = new Date("2026-11-13T06:00:00Z");

  it("names the weekday, day and month, without the year in the current year", () => {
    expect(formatPaymentDay(new Date("2026-11-19T06:00:00Z"), now)).toBe("Thu 19 Nov");
  });

  it("adds the year when it is not this year", () => {
    expect(formatPaymentDay(new Date("2027-11-11T06:00:00Z"), now)).toBe("Thu 11 Nov 2027");
  });

  it("reads the day in India, not in UTC", () => {
    expect(formatPaymentDay(new Date("2026-11-18T20:00:00Z"), now)).toBe("Thu 19 Nov");
  });
});
