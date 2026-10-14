import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";
import { BillingRangeError } from "./billing-range-error";

describe("amountInWords", () => {
  it("writes rupees and paise the Indian way", () => {
    expect(amountInWords(660_706)).toBe("Indian Rupees Six Thousand Six Hundred Seven and Six Paise Only");
    expect(amountInWords(943_646)).toBe("Indian Rupees Nine Thousand Four Hundred Thirty Six and Forty Six Paise Only");
  });

  it("uses lakh and crore", () => {
    expect(amountInWords(12_34_56_789_00)).toBe(
      "Indian Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only",
    );
  });

  it("keeps counting crores past 99 crore", () => {
    // 12,345,678,901 rupees: 1,234 crore, 56 lakh, 78 thousand, 901.
    expect(amountInWords(1_234_56_78_901_00)).toBe(
      "Indian Rupees One Thousand Two Hundred Thirty Four Crore Fifty Six Lakh Seventy Eight Thousand Nine Hundred One Only",
    );
  });

  it("says zero rupees when there are only paise", () => {
    expect(amountInWords(50)).toBe("Indian Rupees Zero and Fifty Paise Only");
  });

  it("refuses an amount that is not a whole, non-negative number of paise", () => {
    expect(() => amountInWords(Number.NaN)).toThrow(RangeError);
    expect(() => amountInWords(-1)).toThrow(RangeError);
    expect(() => amountInWords(100.5)).toThrow(RangeError);
    expect(() => amountInWords(-1)).toThrow(BillingRangeError);
  });

  it("leaves out paise when there are none, and says zero", () => {
    expect(amountInWords(100)).toBe("Indian Rupees One Only");
    expect(amountInWords(0)).toBe("Indian Rupees Zero Only");
  });
});
