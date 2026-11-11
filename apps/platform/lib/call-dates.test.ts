import { describe, expect, it } from "vitest";
import { addWorkingDays, callWhen, dayMonth, promiseDates, shortDay, slotDay, slotHour, slotLabel, slotTime } from "@/lib/call-dates";

describe("promiseDates", () => {
  it("promises a start within 48 hours and a live site 7 working days after the call", () => {
    // Tue 27 Oct 2026, 14:00 in India.
    expect(promiseDates("2026-10-27T08:30:00.000Z")).toEqual({ startBy: "2026-10-29", liveBy: "2026-11-05" });
  });

  it("skips Saturday and Sunday", () => {
    // Fri 30 Oct 2026, 10:00 in India: Mon 2 to Fri 6 is five, Mon 9 and Tue 10 make seven.
    expect(promiseDates("2026-10-30T04:30:00.000Z").liveBy).toBe("2026-11-10");
  });

  it("counts days in India, not in UTC", () => {
    // 19:00 UTC on Tue 27 Oct is 00:30 on Wed 28 Oct in India.
    expect(promiseDates("2026-10-27T19:00:00.000Z")).toEqual({ startBy: "2026-10-30", liveBy: "2026-11-06" });
  });
});

describe("addWorkingDays", () => {
  it("lands on a weekday", () => {
    expect(addWorkingDays("2026-10-30", 1)).toBe("2026-11-02");
  });
});

describe("labels", () => {
  it("writes days, times and slots the way the screens show them", () => {
    expect(shortDay("2026-11-05")).toBe("Thu 5 Nov");
    expect(slotDay("2026-10-27T08:30:00.000Z")).toBe("Tue");
    expect(slotTime("2026-10-27T08:30:00.000Z")).toBe("2:00 pm");
    expect(slotTime("2026-10-27T04:30:00.000Z")).toBe("10:00 am");
    expect(slotHour("2026-10-27T08:30:00.000Z")).toBe(14);
    expect(slotHour("2026-10-27T18:30:00.000Z")).toBe(0);
    expect(slotLabel("2026-10-27T08:30:00.000Z")).toBe("Tue 27 Oct, 2:00 pm");
    expect(dayMonth(new Date("2026-10-26T05:00:00.000Z"))).toBe("26 Oct");
  });
});

describe("callWhen", () => {
  // 2:45 pm in India on Mon 2 Nov 2026.
  const CALL = "2026-11-02T09:15:00.000Z";

  it("is just the time when the call was today in India", () => {
    expect(callWhen(CALL, new Date("2026-11-02T13:00:00.000Z"))).toBe("2:45 pm");
  });

  it("carries the day when the call was on another day, counting days in India", () => {
    expect(callWhen(CALL, new Date("2026-11-03T05:00:00.000Z"))).toBe("Mon 2 Nov, 2:45 pm");
    // 19:00 UTC on 2 Nov is already Tue 3 Nov in India.
    expect(callWhen(CALL, new Date("2026-11-02T19:00:00.000Z"))).toBe("Mon 2 Nov, 2:45 pm");
  });
});
