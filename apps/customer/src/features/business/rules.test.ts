import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/form";
import {
  announcementSchema,
  announcementStatus,
  closesNextDay,
  closureEnded,
  closureSchema,
  formSnapshot,
  fromStoredHours,
  hoursField,
  hoursFormValues,
  hoursSchema,
  isIsoDate,
  MAX_PHOTOS,
  planUpload,
  toFormData,
  toStoredHours,
  upcomingClosures,
  type OpeningHours,
} from "./rules";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("isIsoDate", () => {
  it("accepts real dates and refuses impossible or out of range ones", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("1999-12-31")).toBe(false);
    expect(isIsoDate("2101-01-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });
});

describe("hoursSchema", () => {
  const week = (overrides: Record<string, string> = {}) => {
    const entries: Record<string, string> = {};
    for (let day = 0; day < 7; day += 1) entries[hoursField(day, "mode")] = "unset";
    return form({ ...entries, ...overrides });
  };

  it("leaves unset days out, so hours can be skipped entirely", () => {
    expect(parseForm(hoursSchema, week())).toEqual({ ok: true, data: [] });
  });

  it("treats a day that was not sent as unset", () => {
    expect(parseForm(hoursSchema, form({}))).toEqual({ ok: true, data: [] });
  });

  it("keeps times only for an open day and reads closed and all-day as they are", () => {
    const parsed = parseForm(
      hoursSchema,
      week({
        [hoursField(0, "mode")]: "open",
        [hoursField(0, "opens")]: "09:00",
        [hoursField(0, "closes")]: "18:00",
        [hoursField(1, "mode")]: "closed",
        [hoursField(1, "opens")]: "09:00",
        [hoursField(2, "mode")]: "all-day",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      data: [
        { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" },
        { dayOfWeek: 1, mode: "closed" },
        { dayOfWeek: 2, mode: "all-day" },
      ],
    });
  });

  it("accepts a day that closes after midnight", () => {
    const parsed = parseForm(hoursSchema, week({ [hoursField(4, "mode")]: "open", [hoursField(4, "opens")]: "18:00", [hoursField(4, "closes")]: "02:00" }));
    expect(parsed).toEqual({ ok: true, data: [{ dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" }] });
    expect(closesNextDay("18:00", "02:00")).toBe(true);
    expect(closesNextDay("09:00", "18:00")).toBe(false);
  });

  it("asks for the missing time on the day it belongs to", () => {
    expect(parseForm(hoursSchema, week({ [hoursField(2, "mode")]: "open", [hoursField(2, "closes")]: "18:00" }))).toMatchObject({
      ok: false,
      fieldErrors: { [hoursField(2, "opens")]: "Add an opening time, or choose another option for this day." },
    });
    expect(parseForm(hoursSchema, week({ [hoursField(2, "mode")]: "open", [hoursField(2, "opens")]: "09:00" }))).toMatchObject({
      ok: false,
      fieldErrors: { [hoursField(2, "closes")]: "Add a closing time, or choose another option for this day." },
    });
  });

  it("refuses equal times and points to Open 24 hours", () => {
    expect(parseForm(hoursSchema, week({ [hoursField(3, "mode")]: "open", [hoursField(3, "opens")]: "09:00", [hoursField(3, "closes")]: "09:00" }))).toMatchObject({
      ok: false,
      fieldErrors: { [hoursField(3, "closes")]: "For round-the-clock opening, choose Open 24 hours." },
    });
  });

  it("refuses a malformed time and an unknown mode", () => {
    expect(parseForm(hoursSchema, week({ [hoursField(0, "mode")]: "open", [hoursField(0, "opens")]: "9am", [hoursField(0, "closes")]: "18:00" })).ok).toBe(false);
    expect(parseForm(hoursSchema, week({ [hoursField(0, "mode")]: "sometimes" }))).toMatchObject({ ok: false, fieldErrors: { [hoursField(0, "mode")]: expect.any(String) } });
  });
});

describe("stored hours", () => {
  it("round trips through the table's shape", () => {
    const days: OpeningHours[] = [
      { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" },
      { dayOfWeek: 1, mode: "closed" },
      { dayOfWeek: 2, mode: "all-day" },
    ];
    expect(days.map(toStoredHours).map(fromStoredHours)).toEqual(days);
  });

  it("stores the columns /api/site/info reads", () => {
    expect(toStoredHours({ dayOfWeek: 5, mode: "open", opensAt: "10:00", closesAt: "14:00" })).toEqual({ dayOfWeek: 5, opensAt: "10:00", closesAt: "14:00", closed: false, openAllDay: false });
    expect(toStoredHours({ dayOfWeek: 6, mode: "closed" })).toEqual({ dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false });
    expect(toStoredHours({ dayOfWeek: 6, mode: "all-day" })).toEqual({ dayOfWeek: 6, opensAt: null, closesAt: null, closed: false, openAllDay: true });
  });

  it("reads Postgres HH:MM:SS as HH:MM and drops a row it cannot show", () => {
    expect(fromStoredHours({ dayOfWeek: 0, opensAt: "09:00:00", closesAt: "18:30:00", closed: false, openAllDay: false })).toEqual({ dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:30" });
    expect(fromStoredHours({ dayOfWeek: 0, opensAt: null, closesAt: null, closed: false, openAllDay: false })).toBeNull();
  });

  it("starts the editor with a value for every day, first open shift of a split day", () => {
    const values = hoursFormValues([
      { dayOfWeek: 0, opensAt: "09:00:00", closesAt: "13:00:00", closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: "15:00:00", closesAt: "19:00:00", closed: false, openAllDay: false },
      { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
    ]);
    expect(Object.keys(values)).toHaveLength(21);
    expect(values[hoursField(0, "mode")]).toBe("open");
    expect(values[hoursField(0, "opens")]).toBe("09:00");
    expect(values[hoursField(6, "mode")]).toBe("closed");
    expect(values[hoursField(3, "mode")]).toBe("unset");
    expect(values[hoursField(3, "opens")]).toBe("");
  });
});

describe("announcementSchema", () => {
  const valid = { message: " Closed for Diwali ", startsOn: "2026-11-08", endsOn: "2026-11-10" };
  const one = "Write the announcement in one line, up to 100 characters.";

  it("trims the message and keeps the dates", () => {
    expect(parseForm(announcementSchema, form(valid))).toEqual({ ok: true, data: { message: "Closed for Diwali", startsOn: "2026-11-08", endsOn: "2026-11-10" } });
  });

  it("requires a message of 1 to 100 characters", () => {
    expect(parseForm(announcementSchema, form({ ...valid, message: "   " }))).toMatchObject({ ok: false, fieldErrors: { message: one } });
    expect(parseForm(announcementSchema, form({ ...valid, message: "x".repeat(101) }))).toMatchObject({ ok: false, fieldErrors: { message: one } });
    expect(parseForm(announcementSchema, form({ ...valid, message: "x".repeat(100) })).ok).toBe(true);
  });

  it("refuses line breaks on the raw value, since cleaning would squash them flat", () => {
    expect(parseForm(announcementSchema, form({ ...valid, message: "Line one\nLine two" }))).toMatchObject({ ok: false, fieldErrors: { message: one } });
    expect(parseForm(announcementSchema, form({ ...valid, message: "Line one\r\nLine two" }))).toMatchObject({ ok: false, fieldErrors: { message: one } });
  });

  it("strips a stray control character instead of refusing", () => {
    expect(parseForm(announcementSchema, form({ ...valid, message: "Closed\u0000 for Diwali" }))).toMatchObject({ ok: true, data: { message: "Closed for Diwali" } });
  });

  it("needs both days, a real date, and the end not before the start", () => {
    expect(parseForm(announcementSchema, form({ ...valid, startsOn: "" }))).toMatchObject({ ok: false, fieldErrors: { startsOn: "Choose the day it starts." } });
    expect(parseForm(announcementSchema, form({ ...valid, endsOn: "2026-02-30" }))).toMatchObject({ ok: false, fieldErrors: { endsOn: "Choose the last day it shows." } });
    expect(parseForm(announcementSchema, form({ ...valid, startsOn: "2026-11-10", endsOn: "2026-11-08" }))).toMatchObject({ ok: false, fieldErrors: { endsOn: "The last day can't be before the first." } });
    expect(parseForm(announcementSchema, form({ ...valid, startsOn: "2026-11-08", endsOn: "2026-11-08" })).ok).toBe(true);
  });

  it("says whether it is coming, showing or over", () => {
    const announcement = { message: "x", startsOn: "2026-11-08", endsOn: "2026-11-10" };
    expect(announcementStatus(announcement, "2026-11-07")).toEqual({ kind: "starts", on: "2026-11-08" });
    expect(announcementStatus(announcement, "2026-11-10")).toEqual({ kind: "showing", until: "2026-11-10" });
    expect(announcementStatus(announcement, "2026-11-11")).toEqual({ kind: "ended" });
  });
});

describe("closureSchema", () => {
  const valid = { startsOn: "2026-12-25", endsOn: "2026-12-26", note: " Christmas " };

  it("trims the note, keeps the dates and is closed all day by default", () => {
    expect(parseForm(closureSchema, form(valid))).toEqual({ ok: true, data: { startsOn: "2026-12-25", endsOn: "2026-12-26", note: "Christmas", opensAt: null, closesAt: null } });
  });

  it("treats a blank or missing note as none", () => {
    expect(parseForm(closureSchema, form({ ...valid, note: "   " }))).toMatchObject({ ok: true, data: { note: null } });
    expect(parseForm(closureSchema, form({ startsOn: valid.startsOn, endsOn: valid.endsOn }))).toMatchObject({ ok: true, data: { note: null } });
  });

  it("needs both days and the end not before the start", () => {
    expect(parseForm(closureSchema, form({ ...valid, startsOn: "" }))).toMatchObject({ ok: false, fieldErrors: { startsOn: "Choose the first closed day." } });
    expect(parseForm(closureSchema, form({ ...valid, endsOn: "" }))).toMatchObject({ ok: false, fieldErrors: { endsOn: "Choose the last closed day." } });
    expect(parseForm(closureSchema, form({ ...valid, startsOn: "2026-12-26", endsOn: "2026-12-25" }))).toMatchObject({ ok: false, fieldErrors: { endsOn: "The last day can't be before the first." } });
    expect(parseForm(closureSchema, form({ ...valid, endsOn: valid.startsOn })).ok).toBe(true);
  });

  it("limits the note to 80 characters on one line", () => {
    expect(parseForm(closureSchema, form({ ...valid, note: "x".repeat(80) })).ok).toBe(true);
    expect(parseForm(closureSchema, form({ ...valid, note: "x".repeat(81) }))).toMatchObject({ ok: false, fieldErrors: { note: "Keep the note to 80 characters." } });
    expect(parseForm(closureSchema, form({ ...valid, note: "a\nb" }))).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
  });

  it("stores a half day with both times, which must differ", () => {
    expect(parseForm(closureSchema, form({ ...valid, kind: "hours", opensAt: "10:00", closesAt: "14:00" }))).toMatchObject({ ok: true, data: { opensAt: "10:00", closesAt: "14:00" } });
    expect(parseForm(closureSchema, form({ ...valid, kind: "hours", opensAt: "", closesAt: "14:00" }))).toMatchObject({ ok: false, fieldErrors: { opensAt: "Choose the time you open." } });
    expect(parseForm(closureSchema, form({ ...valid, kind: "hours", opensAt: "10:00", closesAt: "" }))).toMatchObject({ ok: false, fieldErrors: { closesAt: "Choose the time you close." } });
    expect(parseForm(closureSchema, form({ ...valid, kind: "hours", opensAt: "10:00", closesAt: "10:00" }))).toMatchObject({ ok: false, fieldErrors: { closesAt: "Opening and closing can't be the same time." } });
  });

  it("ignores times sent with kind closed, so both stay null", () => {
    expect(parseForm(closureSchema, form({ ...valid, kind: "closed", opensAt: "10:00", closesAt: "14:00" }))).toMatchObject({ ok: true, data: { opensAt: null, closesAt: null } });
  });
});

describe("upcomingClosures", () => {
  const closure = (id: string, startsOn: string, endsOn: string) => ({ id, startsOn, endsOn, note: null });

  it("drops closures that ended before today, keeps one ending today, soonest first", () => {
    const rows = [closure("c", "2026-12-01", "2026-12-02"), closure("past", "2026-10-01", "2026-10-02"), closure("a", "2026-11-05", "2026-11-05")];
    expect(upcomingClosures(rows, "2026-11-05").map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("judges a closure as ended once its last day is before today", () => {
    expect(closureEnded({ endsOn: "2026-11-04" }, "2026-11-05")).toBe(true);
    expect(closureEnded({ endsOn: "2026-11-05" }, "2026-11-05")).toBe(false);
  });
});

describe("planUpload", () => {
  const files = (count: number) => Array.from({ length: count }, (_, index) => new File(["x"], `photo-${index}.jpg`));

  it("takes one logo at a time", () => {
    const plan = planUpload("logo", files(3), 0);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.turnedAway).toHaveLength(2);
    expect(plan.turnedAway[0]?.message).toBe("Add one logo at a time.");
  });

  it("fills only the photo slots left under the limit", () => {
    const plan = planUpload("photo", files(5), MAX_PHOTOS - 2);
    expect(plan.accepted).toHaveLength(2);
    expect(plan.turnedAway).toHaveLength(3);
    expect(plan.turnedAway[0]?.message).toBe(`You can keep up to ${MAX_PHOTOS} photos, so this one was not added.`);
    expect(planUpload("photo", files(1), MAX_PHOTOS).accepted).toHaveLength(0);
  });
});

describe("form snapshot", () => {
  it("is equal for equal values and differs after any edit", () => {
    const a = formSnapshot(Object.entries({ name: "Apex", phone: "98201 55012" }));
    expect(formSnapshot(Object.entries({ name: "Apex", phone: "98201 55012" }))).toBe(a);
    expect(formSnapshot(Object.entries({ name: "Apex ", phone: "98201 55012" }))).not.toBe(a);
  });

  it("counts a file by its name", () => {
    expect(formSnapshot([["logo", new File(["x"], "logo.png")]])).toBe(JSON.stringify([["logo", "logo.png"]]));
  });

  it("builds the FormData an action reads from the values", () => {
    expect(toFormData({ a: "1", b: "" }).get("a")).toBe("1");
    expect(toFormData({ a: "1", b: "" }).get("b")).toBe("");
  });
});
