import { describe, expect, it } from "vitest";
import { callInviteHref, dayKey, groupSlotsByDay, keyOf, monthWeeks } from "./call-slots";

describe("dayKey", () => {
  it("names the day in the viewer's zone, not UTC", () => {
    expect(dayKey("2026-10-20T20:00:00.000Z", "Asia/Kolkata")).toBe("2026-10-21");
    expect(dayKey("2026-10-20T20:00:00.000Z", "UTC")).toBe("2026-10-20");
  });
});

describe("groupSlotsByDay", () => {
  it("groups and orders the times of each day", () => {
    const days = groupSlotsByDay(["2026-10-21T09:00:00.000Z", "2026-10-21T05:00:00.000Z", "2026-10-22T05:00:00.000Z"], "UTC");
    expect([...days.keys()]).toEqual(["2026-10-21", "2026-10-22"]);
    expect(days.get("2026-10-21")).toEqual(["2026-10-21T05:00:00.000Z", "2026-10-21T09:00:00.000Z"]);
  });
});

describe("monthWeeks", () => {
  it("starts on Monday and pads with null", () => {
    const weeks = monthWeeks(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter((cell) => cell !== null)).toHaveLength(31);
  });
});

describe("keyOf", () => {
  it("pads month and day", () => {
    expect(keyOf(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("callInviteHref", () => {
  it("writes the start and end in UTC", () => {
    const file = decodeURIComponent(callInviteHref("2026-10-19T05:30:00.000Z", "2026-10-19T06:00:00.000Z").split(",")[1] ?? "");
    expect(file).toContain("DTSTART:20261019T053000Z");
    expect(file).toContain("DTEND:20261019T060000Z");
    expect(file.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});
