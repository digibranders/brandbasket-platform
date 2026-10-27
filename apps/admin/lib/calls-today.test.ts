import { describe, expect, it } from "vitest";
import { callTiming } from "./calls-today";

const NOW = new Date("2026-11-30T05:00:00.000Z");
const minutes = (count: number): Date => new Date(NOW.getTime() + count * 60_000);

describe("callTiming", () => {
  it("says whether a call is done, on now, soon or later", () => {
    expect(callTiming(minutes(-60), minutes(-30), NOW)).toEqual({ label: "Done", tone: "done" });
    expect(callTiming(minutes(-10), minutes(20), NOW)).toEqual({ label: "Now", tone: "progress" });
    expect(callTiming(minutes(45), minutes(75), NOW)).toEqual({ label: "In 45m", tone: "progress" });
    expect(callTiming(minutes(60), minutes(90), NOW)).toEqual({ label: "In 1h", tone: "progress" });
    expect(callTiming(minutes(110), minutes(140), NOW)).toEqual({ label: "In 2h", tone: "progress" });
    expect(callTiming(minutes(180), minutes(210), NOW)).toEqual({ label: "Later", tone: "todo" });
  });
});
