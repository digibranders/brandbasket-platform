import { describe, expect, it } from "vitest";
import { closesNextDay, describeHours, describeOpenStatus, describeStoredDay, fromStoredHours, isDayMode, toStoredHours, toTimeOfDay } from "./hours";

describe("toTimeOfDay", () => {
  it("strips a trailing :SS from a Postgres time", () => {
    expect(toTimeOfDay("09:30:00")).toBe("09:30");
  });

  it("passes an already-HH:MM value through unchanged", () => {
    expect(toTimeOfDay("09:30")).toBe("09:30");
  });
});

describe("closesNextDay", () => {
  it("is true only when closing comes before opening", () => {
    expect(closesNextDay("18:00", "02:00")).toBe(true);
    expect(closesNextDay("09:00", "18:00")).toBe(false);
    expect(closesNextDay("00:00", "23:59")).toBe(false);
  });
});

describe("toStoredHours and fromStoredHours", () => {
  it("round-trip every kind of day", () => {
    const days = [
      { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" },
      { dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 5, mode: "all-day" },
      { dayOfWeek: 6, mode: "closed" },
    ] as const;
    for (const day of days) expect(fromStoredHours(toStoredHours(day))).toEqual(day);
  });

  it("stores no times on a closed or all-day day", () => {
    expect(toStoredHours({ dayOfWeek: 6, mode: "closed" })).toEqual({
      dayOfWeek: 6,
      opensAt: null,
      closesAt: null,
      closed: true,
      openAllDay: false,
    });
    expect(toStoredHours({ dayOfWeek: 5, mode: "all-day" })).toEqual({
      dayOfWeek: 5,
      opensAt: null,
      closesAt: null,
      closed: false,
      openAllDay: true,
    });
  });

  it("reads Postgres times, and ignores stray times on a closed row", () => {
    expect(
      fromStoredHours({ dayOfWeek: 1, opensAt: "07:30:00", closesAt: "01:00:00", closed: false, openAllDay: false }),
    ).toEqual({ dayOfWeek: 1, mode: "open", opensAt: "07:30", closesAt: "01:00" });
    expect(
      fromStoredHours({ dayOfWeek: 6, opensAt: "17:00:00", closesAt: "09:00:00", closed: true, openAllDay: false }),
    ).toEqual({ dayOfWeek: 6, mode: "closed" });
    expect(
      fromStoredHours({ dayOfWeek: 1, opensAt: null, closesAt: null, closed: false, openAllDay: false }),
    ).toBeNull();
  });
});

describe("describeHours", () => {
  it("marks an overnight closing time", () => {
    expect(describeHours({ dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" })).toBe(
      "18:00 – 02:00 (next day)",
    );
    expect(describeHours({ dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" })).toBe("09:00 – 18:00");
    expect(describeHours({ dayOfWeek: 5, mode: "all-day" })).toBe("Open 24 hours");
    expect(describeHours({ dayOfWeek: 6, mode: "closed" })).toBe("Closed");
  });
});

describe("describeStoredDay", () => {
  const open = (opensAt: string, closesAt: string) => ({ dayOfWeek: 0, opensAt, closesAt, closed: false, openAllDay: false });
  const closed = { dayOfWeek: 0, opensAt: null, closesAt: null, closed: true, openAllDay: false };

  it("lists split shifts in order and marks the one past midnight", () => {
    expect(describeStoredDay([open("09:00:00", "12:00:00"), open("19:00:00", "01:00:00")])).toBe(
      "09:00 – 12:00, 19:00 – 01:00 (next day)",
    );
  });

  it("says closed only when nothing is open, and nothing for a day with no rows", () => {
    expect(describeStoredDay([closed])).toBe("Closed");
    expect(describeStoredDay([closed, open("10:00:00", "14:00:00")])).toBe("10:00 – 14:00");
    expect(describeStoredDay([{ ...closed, closed: false, openAllDay: true }])).toBe("Open 24 hours");
    expect(describeStoredDay([])).toBeNull();
  });
});

describe("isDayMode", () => {
  it("accepts only the editor's four choices", () => {
    for (const mode of ["unset", "open", "closed", "all-day"]) expect(isDayMode(mode)).toBe(true);
    for (const mode of ["", "Open", "24h", "closed "]) expect(isDayMode(mode)).toBe(false);
  });
});

describe("describeOpenStatus", () => {
  // 2026-10-05 is a Monday; 10:40 in Asia/Kolkata (UTC+5:30) is 05:10 UTC.
  const monday1040 = new Date("2026-10-05T05:10:00Z");
  const row = (dayOfWeek: number, opensAt: string, closesAt: string) => ({
    dayOfWeek,
    opensAt,
    closesAt,
    closed: false,
    openAllDay: false,
  });

  it("says when an open business closes", () => {
    expect(describeOpenStatus([row(0, "10:00:00", "19:00:00")], "Asia/Kolkata", monday1040)).toBe("Open · Closes 7 pm");
  });

  it("says when a closed business next opens, naming the day when it is not today", () => {
    expect(describeOpenStatus([row(0, "11:00:00", "13:00:00")], "Asia/Kolkata", monday1040)).toBe("Closed · Opens 11 am");
    expect(describeOpenStatus([row(1, "09:30:00", "13:00:00")], "Asia/Kolkata", monday1040)).toBe("Closed · Opens Tue 9:30 am");
  });

  it("reads a closing time past midnight as open into the next morning", () => {
    expect(describeOpenStatus([row(6, "18:00:00", "02:00:00")], "Asia/Kolkata", new Date("2026-10-04T20:00:00Z"))).toBe(
      "Open · Closes 2 am",
    );
  });

  it("is null when no day has hours", () => {
    expect(describeOpenStatus([], "Asia/Kolkata", monday1040)).toBeNull();
  });
});

describe("describeOpenStatus with holidays", () => {
  const weekly = [0, 1, 2, 3, 4].map((dayOfWeek) => ({ dayOfWeek, opensAt: "09:00:00", closesAt: "21:00:00", closed: false, openAllDay: false }));
  // Saturday 10 October 2026, 11:00 in Asia/Kolkata (05:30 UTC); the week above is Monday to Friday.
  const saturday = new Date("2026-10-10T05:30:00Z");
  const monday = new Date("2026-10-12T05:30:00Z");
  const mondayNight = new Date("2026-10-12T16:30:00Z");
  const tuesday = new Date("2026-10-13T05:30:00Z");

  it("says a holiday today closes the business, with its reason", () => {
    const holiday = [{ startsOn: "2026-10-12", endsOn: "2026-10-12", note: "Staff day" }];
    expect(describeOpenStatus(weekly, "Asia/Kolkata", monday, holiday)).toBe("Closed today · Staff day");
  });

  it("names the holiday when the next opening is a half day", () => {
    const holiday = [{ startsOn: "2026-10-13", endsOn: "2026-10-13", note: "Puja", opensAt: "10:00", closesAt: "14:00" }];
    expect(describeOpenStatus(weekly, "Asia/Kolkata", mondayNight, holiday)).toBe("Closed · Opens Tue 10 am · Puja");
    expect(describeOpenStatus(weekly, "Asia/Kolkata", tuesday, holiday)).toBe("Open · Closes 2 pm · Puja");
  });

  it("skips a closed holiday when working out the next opening", () => {
    const holiday = [{ startsOn: "2026-10-12", endsOn: "2026-10-12", note: null }];
    expect(describeOpenStatus(weekly, "Asia/Kolkata", saturday, holiday)).toBe("Closed · Opens Tue 9 am");
  });

  it("ignores a holiday on other dates", () => {
    const holiday = [{ startsOn: "2026-11-08", endsOn: "2026-11-09", note: "Diwali" }];
    expect(describeOpenStatus(weekly, "Asia/Kolkata", monday, holiday)).toBe("Open · Closes 9 pm");
  });
});
