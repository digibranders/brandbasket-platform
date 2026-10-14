import { describe, expect, it } from "vitest";
import {
  calendarDateIn,
  isAcceptableReceivedDate,
  MANUAL_PAYMENT_CONFIRM_FIELD,
  MANUAL_PAYMENT_RECEIVED_ON_FIELD,
  MANUAL_PAYMENT_REFERENCE_FIELD,
  parseManualPaymentForm,
  utcCalendarDate,
} from "./manual-payment-form";

// 16 September 2026, 20:00 UTC: already 17 September in India and New Zealand.
const NOW = new Date("2026-09-16T20:00:00.000Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const VALID = {
  [MANUAL_PAYMENT_CONFIRM_FIELD]: "yes",
  [MANUAL_PAYMENT_REFERENCE_FIELD]: "  HDFC-UTR-000123  ",
  [MANUAL_PAYMENT_RECEIVED_ON_FIELD]: "2026-09-15",
};

describe("parseManualPaymentForm", () => {
  it("returns the trimmed reference and the date", () => {
    expect(parseManualPaymentForm(form(VALID), NOW)).toEqual({
      ok: true,
      details: { reference: "HDFC-UTR-000123", receivedOn: "2026-09-15" },
    });
  });

  it("requires the box to be ticked", () => {
    expect(parseManualPaymentForm(form({ ...VALID, [MANUAL_PAYMENT_CONFIRM_FIELD]: "on" }), NOW)).toEqual({
      ok: false,
      problem: "unconfirmed",
    });
  });

  it.each(["", "   ", "x".repeat(101)])("refuses the reference %j", (reference) => {
    expect(parseManualPaymentForm(form({ ...VALID, [MANUAL_PAYMENT_REFERENCE_FIELD]: reference }), NOW)).toEqual({
      ok: false,
      problem: "missing-reference",
    });
  });

  it("accepts a reference of exactly 100 characters", () => {
    expect(parseManualPaymentForm(form({ ...VALID, [MANUAL_PAYMENT_REFERENCE_FIELD]: "x".repeat(100) }), NOW)).toMatchObject(
      { ok: true },
    );
  });

  it.each(["", "15/09/2026", "2026-02-30", "2026-9-15", "2026-09-19", "2025-09-01"])(
    "refuses the received date %j",
    (receivedOn) => {
      expect(parseManualPaymentForm(form({ ...VALID, [MANUAL_PAYMENT_RECEIVED_ON_FIELD]: receivedOn }), NOW)).toEqual({
        ok: false,
        problem: "invalid-date",
      });
    },
  );
});

describe("isAcceptableReceivedDate", () => {
  it("accepts today in a zone ahead of UTC, but not the day after that", () => {
    expect(isAcceptableReceivedDate("2026-09-16", NOW)).toBe(true);
    expect(isAcceptableReceivedDate("2026-09-17", NOW)).toBe(true);
    expect(isAcceptableReceivedDate("2026-09-18", NOW)).toBe(false);
  });

  it("accepts dates back to a year ago", () => {
    expect(isAcceptableReceivedDate("2025-09-15", NOW)).toBe(true);
    expect(isAcceptableReceivedDate("2025-09-14", NOW)).toBe(false);
  });
});

describe("calendar dates", () => {
  it("formats the date in UTC and in a named zone", () => {
    expect(utcCalendarDate(NOW)).toBe("2026-09-16");
    expect(calendarDateIn(NOW, "Asia/Kolkata")).toBe("2026-09-17");
    expect(calendarDateIn(NOW, "America/New_York")).toBe("2026-09-16");
    expect(() => utcCalendarDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});
