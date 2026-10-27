import type { StaffCallRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { groupCalls } from "./calls-view";

const NOW = new Date("2026-11-30T06:00:00.000Z");

function call(name: string, startsAt: string | null, setupDone = 0): StaffCallRow {
  return {
    businessId: name,
    businessName: name,
    startsAt: startsAt === null ? null : new Date(startsAt),
    endsAt: startsAt === null ? null : new Date(new Date(startsAt).getTime() + 30 * 60_000),
    setupDone,
  };
}

describe("groupCalls", () => {
  it("splits calls into today, upcoming, past and no time, with their labels", () => {
    const groups = groupCalls(
      [
        call("Past", "2026-11-27T06:00:00.000Z", 4),
        call("Today", "2026-11-30T08:30:00.000Z", 2),
        call("Upcoming", "2026-12-01T08:30:00.000Z"),
        call("Unknown", null),
      ],
      NOW,
    );
    expect(groups.today.map((line) => [line.call.businessName, line.when, line.setup])).toEqual([["Today", "14:00", "2 of 4"]]);
    expect(groups.upcoming.map((line) => [line.call.businessName, line.when])).toEqual([["Upcoming", "Tue 1 Dec, 14:00"]]);
    expect(groups.past.map((line) => [line.call.businessName, line.when, line.setup])).toEqual([["Past", "Fri 27 Nov, 11:30", "4 of 4"]]);
    expect(groups.noTime.map((line) => [line.call.businessName, line.when])).toEqual([["Unknown", "Time not reported"]]);
  });

  it("lists the most recent past call first", () => {
    const groups = groupCalls([call("Older", "2026-11-24T06:00:00.000Z"), call("Newer", "2026-11-27T06:00:00.000Z")], NOW);
    expect(groups.past.map((line) => line.call.businessName)).toEqual(["Newer", "Older"]);
  });
});
