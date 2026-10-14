import { describe, expect, it } from "vitest";
import { parseAnnouncementForm, parseClosureForm } from "./forms";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseAnnouncementForm", () => {
  const valid = { message: " Closed for Diwali ", startsOn: "2026-11-08", endsOn: "2026-11-10" };

  it("trims the message and keeps the dates", () => {
    expect(parseAnnouncementForm(form(valid))).toEqual({
      success: true,
      data: { message: "Closed for Diwali", startsOn: "2026-11-08", endsOn: "2026-11-10" },
    });
  });

  it("requires a message", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "   " }))).toMatchObject({
      success: false,
      field: "message",
      message: "Write the announcement in one line, up to 100 characters.",
    });
  });

  it("rejects a message that is too long", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "x".repeat(101) }))).toMatchObject({
      success: false,
      field: "message",
      message: "Write the announcement in one line, up to 100 characters.",
    });
  });

  it("rejects a message with a newline", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "Line one\nLine two" }))).toMatchObject({
      success: false,
      field: "message",
      message: "Write the announcement in one line, up to 100 characters.",
    });
  });

  it("rejects a message with a carriage return and line feed, even though cleaning alone would squash it flat", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "Line one\r\nLine two" }))).toMatchObject({
      success: false,
      field: "message",
      message: "Write the announcement in one line, up to 100 characters.",
    });
  });

  it("strips a stray control character from the message instead of rejecting it", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "Closed\u0000 for Diwali" }))).toMatchObject({
      success: true,
      data: { message: "Closed for Diwali" },
    });
  });

  it("accepts a message right at the limit", () => {
    expect(parseAnnouncementForm(form({ ...valid, message: "x".repeat(100) }))).toMatchObject({ success: true });
  });

  it("requires a start date", () => {
    expect(parseAnnouncementForm(form({ ...valid, startsOn: "" }))).toMatchObject({
      success: false,
      field: "startsOn",
      message: "Choose the day it starts.",
    });
    expect(parseAnnouncementForm(form({ ...valid, startsOn: "not-a-date" }))).toMatchObject({
      success: false,
      field: "startsOn",
      message: "Choose the day it starts.",
    });
  });

  it("requires an end date", () => {
    expect(parseAnnouncementForm(form({ ...valid, endsOn: "" }))).toMatchObject({
      success: false,
      field: "endsOn",
      message: "Choose the last day it shows.",
    });
  });

  it("rejects an end date before the start date", () => {
    expect(parseAnnouncementForm(form({ ...valid, startsOn: "2026-11-10", endsOn: "2026-11-08" }))).toMatchObject({
      success: false,
      field: "endsOn",
      message: "The last day can't be before the first.",
    });
  });

  it("accepts an end date equal to the start date", () => {
    expect(parseAnnouncementForm(form({ ...valid, startsOn: "2026-11-08", endsOn: "2026-11-08" }))).toMatchObject({
      success: true,
    });
  });
});

describe("parseClosureForm", () => {
  const valid = { startsOn: "2026-12-25", endsOn: "2026-12-26", note: " Christmas " };

  it("trims the note and keeps the dates", () => {
    expect(parseClosureForm(form(valid))).toEqual({
      success: true,
      data: { startsOn: "2026-12-25", endsOn: "2026-12-26", note: "Christmas", opensAt: null, closesAt: null },
    });
  });

  it("treats a blank note as none", () => {
    expect(parseClosureForm(form({ ...valid, note: "   " }))).toMatchObject({ success: true, data: { note: null } });
  });

  it("allows the note to be missing entirely", () => {
    expect(parseClosureForm(form({ startsOn: valid.startsOn, endsOn: valid.endsOn }))).toMatchObject({
      success: true,
      data: { note: null },
    });
  });

  it("requires a start date", () => {
    expect(parseClosureForm(form({ ...valid, startsOn: "" }))).toMatchObject({
      success: false,
      field: "startsOn",
      message: "Choose the first closed day.",
    });
  });

  it("requires an end date", () => {
    expect(parseClosureForm(form({ ...valid, endsOn: "" }))).toMatchObject({
      success: false,
      field: "endsOn",
      message: "Choose the last closed day.",
    });
  });

  it("rejects an end date before the start date", () => {
    expect(parseClosureForm(form({ ...valid, startsOn: "2026-12-26", endsOn: "2026-12-25" }))).toMatchObject({
      success: false,
      field: "endsOn",
      message: "The last day can't be before the first.",
    });
  });

  it("accepts an end date equal to the start date", () => {
    expect(parseClosureForm(form({ ...valid, startsOn: "2026-12-25", endsOn: "2026-12-25" }))).toMatchObject({
      success: true,
    });
  });

  it("rejects a note that is too long", () => {
    expect(parseClosureForm(form({ ...valid, note: "x".repeat(81) }))).toMatchObject({
      success: false,
      field: "note",
      message: "Keep the note to 80 characters.",
    });
  });

  it("accepts a note right at the limit", () => {
    expect(parseClosureForm(form({ ...valid, note: "x".repeat(80) }))).toMatchObject({ success: true });
  });

  it("rejects a note with a carriage return and line feed, even though cleaning alone would squash it flat", () => {
    expect(parseClosureForm(form({ ...valid, note: "Line one\r\nLine two" }))).toMatchObject({
      success: false,
      field: "note",
      message: "Keep the note to 80 characters.",
    });
  });

  it("strips a stray control character from the note instead of rejecting it", () => {
    expect(parseClosureForm(form({ ...valid, note: "Christ\u0000mas" }))).toMatchObject({
      success: true,
      data: { note: "Christmas" },
    });
  });
});

describe("parseClosureForm half days", () => {
  const base = { startsOn: "2026-11-10", endsOn: "2026-11-10", note: "Diwali", kind: "hours" };

  it("keeps the hours of a half day", () => {
    expect(parseClosureForm(form({ ...base, opensAt: "10:00", closesAt: "14:00" }))).toEqual({
      success: true,
      data: { startsOn: "2026-11-10", endsOn: "2026-11-10", note: "Diwali", opensAt: "10:00", closesAt: "14:00" },
    });
  });

  it("asks for both times", () => {
    expect(parseClosureForm(form({ ...base, closesAt: "14:00" }))).toMatchObject({ success: false, field: "opensAt" });
    expect(parseClosureForm(form({ ...base, opensAt: "10:00" }))).toMatchObject({ success: false, field: "closesAt" });
  });

  it("refuses the same time twice", () => {
    expect(parseClosureForm(form({ ...base, opensAt: "10:00", closesAt: "10:00" }))).toMatchObject({ success: false, field: "closesAt" });
  });

  it("ignores stray times when the day is closed all day", () => {
    expect(parseClosureForm(form({ ...base, kind: "closed", opensAt: "10:00", closesAt: "14:00" }))).toMatchObject({
      success: true,
      data: { opensAt: null, closesAt: null },
    });
  });
});
