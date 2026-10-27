import { describe, expect, it } from "vitest";
import { parseDeclineReason, parseQuoteForm } from "@/lib/request-form";

const GOOD = { what: " New page ", hours: "3", workingDays: "5", note: "" };

describe("parseQuoteForm", () => {
  it("reads what, whole hours, working days and an optional note", () => {
    expect(parseQuoteForm(GOOD)).toEqual({ success: true, data: { what: "New page", hours: 3, workingDays: 5, note: null } });
    expect(parseQuoteForm({ ...GOOD, note: "  Happy to. We use your photos.  " })).toMatchObject({ success: true, data: { note: "Happy to. We use your photos." } });
  });

  it("refuses hours that are not whole numbers from 1 to 40", () => {
    for (const hours of ["", "0", "41", "2.5", "-1", "3 hours", "abc", "1000"]) {
      expect(parseQuoteForm({ ...GOOD, hours }), hours).toEqual({ success: false, message: "Hours must be a whole number from 1 to 40." });
    }
    expect(parseQuoteForm({ ...GOOD, hours: "40" })).toMatchObject({ success: true });
  });

  it("refuses working days that are not whole numbers from 1 to 30", () => {
    for (const workingDays of ["", "0", "31", "1.5", "x"]) {
      expect(parseQuoteForm({ ...GOOD, workingDays }), workingDays).toEqual({ success: false, message: "Working days must be a whole number from 1 to 30." });
    }
  });

  it("refuses a missing, short or long description, and a long note", () => {
    expect(parseQuoteForm({ ...GOOD, what: "ab" })).toEqual({ success: false, message: "Say what the quote is for in 3 to 80 characters." });
    expect(parseQuoteForm({ ...GOOD, what: "x".repeat(81) })).toMatchObject({ success: false });
    expect(parseQuoteForm({ ...GOOD, note: "x".repeat(2001) })).toEqual({ success: false, message: "Keep the note to 2000 characters or fewer." });
  });

  it("has no price in it: staff never type a rate", () => {
    expect(Object.keys(parseQuoteForm(GOOD).success ? (parseQuoteForm(GOOD) as { data: object }).data : {})).toEqual(["what", "hours", "workingDays", "note"]);
  });
});

describe("parseDeclineReason", () => {
  it("takes a reason of 3 to 300 characters, trimmed", () => {
    expect(parseDeclineReason("  We do not build online shops.  ")).toEqual({ success: true, reason: "We do not build online shops." });
    expect(parseDeclineReason("no")).toEqual({ success: false, message: "Say why in 3 to 300 characters." });
    expect(parseDeclineReason("x".repeat(301))).toMatchObject({ success: false });
  });
});
