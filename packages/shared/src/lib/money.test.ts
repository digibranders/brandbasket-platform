import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "./money";

describe("formatMoney", () => {
  it("formats the USD plan without decimals", () => {
    expect(formatMoney(22500, "USD")).toBe("$225");
    expect(formatMoney(7500, "USD")).toBe("$75");
  });

  it("formats the INR plan with Indian digit grouping", () => {
    expect(formatMoney(750000, "INR")).toBe("₹7,500");
    expect(formatMoney(250000, "INR")).toBe("₹2,500");
    expect(formatMoney(10000000, "INR")).toBe("₹1,00,000");
  });

  it("keeps the decimals when the amount is not whole", () => {
    expect(formatMoney(250, "USD")).toBe("$2.50");
  });

  it("refuses fractional minor units", () => {
    expect(() => formatMoney(22500.5, "USD")).toThrow(RangeError);
  });
});


describe("parseMoney", () => {
  it("reads a whole amount as minor units", () => {
    expect(parseMoney("500")).toBe(50_000);
    expect(parseMoney("0.01")).toBe(1);
  });

  it("reads two decimal places exactly", () => {
    expect(parseMoney("12.34")).toBe(1_234);
    expect(parseMoney("12.3")).toBe(1_230);
  });

  it("ignores grouping separators and surrounding space", () => {
    expect(parseMoney(" 1,234.50 ")).toBe(123_450);
    expect(parseMoney("3,500")).toBe(350_000);
  });

  it("refuses a fraction of a minor unit rather than rounding it away", () => {
    expect(parseMoney("1.234")).toBeNull();
  });

  it("refuses anything that is not a plain amount", () => {
    for (const input of ["", "   ", "abc", "-5", "1.2.3", "$5", "1e3", "."]) expect(parseMoney(input)).toBeNull();
  });
});
