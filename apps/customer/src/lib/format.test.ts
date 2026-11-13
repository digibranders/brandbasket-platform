import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatChange,
  formatDate,
  formatList,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatOutOf,
  formatPercent,
  formatQuantity,
  formatRankChange,
  formatRelative,
  formatTime,
} from "./format";

// 2026-11-03 11:00 India time is 05:30 UTC.
const NOW = new Date("2026-11-03T05:30:00.000Z");

describe("formatMoney", () => {
  it("writes INR with Indian grouping and no paise when they are zero", () => {
    expect(formatMoney(3_039_800, "INR")).toBe("₹30,398");
    expect(formatMoney(1_234_567_00, "INR")).toBe("₹12,34,567");
    expect(formatMoney(299_950, "INR")).toBe("₹2,999.50");
  });

  it("writes USD with no tax wording", () => {
    expect(formatMoney(35_000, "USD")).toBe("$350");
  });
});

describe("dates and times, India time", () => {
  it("writes a date this year without the year", () => {
    expect(formatDate(NOW, NOW)).toBe("Tue 3 Nov");
  });

  it("adds the year for another year", () => {
    expect(formatDate(new Date("2025-11-03T05:30:00.000Z"), NOW)).toBe("Mon 3 Nov 2025");
  });

  it("writes every month as three letters, September included", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach((month, index) => {
      const date = new Date(Date.UTC(2026, index, 15, 6));
      expect(formatDate(date, date)).toMatch(new RegExp(`^[A-Z][a-z]{2} 15 ${month}$`));
    });
    expect(formatDate(new Date("2026-09-24T06:00:00.000Z"), NOW)).toBe("Thu 24 Sep");
  });

  it("uses the India day, not the server's", () => {
    // 20:00 UTC on 2 Nov is 01:30 on 3 Nov in India.
    expect(formatDate(new Date("2026-11-02T20:00:00.000Z"), NOW)).toBe("Tue 3 Nov");
  });

  it("writes times on the 24-hour clock", () => {
    expect(formatTime(NOW)).toBe("11:00");
    expect(formatTime(new Date("2026-11-03T11:30:00.000Z"))).toBe("17:00");
    expect(formatDateTime(NOW, NOW)).toBe("Tue 3 Nov, 11:00");
  });

  it("says Today and Yesterday, then the date", () => {
    expect(formatRelative(new Date("2026-11-03T05:12:00.000Z"), NOW)).toBe("Today, 10:42");
    expect(formatRelative(new Date("2026-11-02T12:00:00.000Z"), NOW)).toBe("Yesterday, 17:30");
    expect(formatRelative(new Date("2026-10-30T05:30:00.000Z"), NOW)).toBe("Fri 30 Oct");
  });
});

describe("numbers and units", () => {
  it("groups numbers the Indian way", () => {
    expect(formatNumber(1_234_567)).toBe("12,34,567");
    expect(formatNumber(4.56)).toBe("4.6");
  });

  it("writes a count with its total and with its unit", () => {
    expect(formatOutOf(9, 12)).toBe("9 of 12");
    expect(formatQuantity(1, "visit")).toBe("1 visit");
    expect(formatQuantity(3, "visit")).toBe("3 visits");
    expect(formatQuantity(2, "enquiry", "enquiries")).toBe("2 enquiries");
  });

  it("writes percentages and changes", () => {
    expect(formatPercent(12)).toBe("12%");
    expect(formatPercent(12.5)).toBe("12.5%");
    expect(formatChange(9)).toBe("+9");
    expect(formatChange(-3)).toBe("-3");
    expect(formatChange(0)).toBe("0");
    expect(formatChange(12, "percent")).toBe("+12%");
  });

  it("treats a smaller rank as better", () => {
    expect(formatRankChange(8, 5)).toBe("↑3");
    expect(formatRankChange(2, 4)).toBe("↓2");
    expect(formatRankChange(3, 3)).toBe("0");
  });

  it("writes file sizes", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(4 * 1024 * 1024)).toBe("4 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });
});

describe("formatList", () => {
  it("joins names for a sentence, with no comma before the last", () => {
    expect(formatList(["Website Management"])).toBe("Website Management");
    expect(formatList(["Website Management", "Social Media Management"])).toBe("Website Management and Social Media Management");
    expect(formatList(["A", "B", "C"])).toBe("A, B and C");
  });
});
