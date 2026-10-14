import { describe, expect, it } from "vitest";
import { closureOn, upcomingClosures, type Closure } from "./closures";

const past: Closure = { id: "past", startsOn: "2026-01-01", endsOn: "2026-01-02", note: null };
const endsToday: Closure = { id: "ends-today", startsOn: "2026-09-24", endsOn: "2026-09-25", note: "Ends today" };
const startsToday: Closure = { id: "starts-today", startsOn: "2026-09-25", endsOn: "2026-09-27", note: null };
const future: Closure = { id: "future", startsOn: "2026-10-01", endsOn: "2026-10-03", note: "Diwali" };
const today = "2026-09-25";

describe("upcomingClosures", () => {
  it("drops closures that ended before today", () => {
    const result = upcomingClosures([past, endsToday, startsToday, future], today);
    expect(result.map((closure) => closure.id)).toEqual(["ends-today", "starts-today", "future"]);
  });

  it("keeps a closure that ends today", () => {
    expect(upcomingClosures([endsToday], today)).toEqual([endsToday]);
  });

  it("orders soonest first", () => {
    const result = upcomingClosures([future, startsToday, endsToday], today);
    expect(result.map((closure) => closure.id)).toEqual(["ends-today", "starts-today", "future"]);
  });

  it("returns an empty array when nothing is upcoming", () => {
    expect(upcomingClosures([past], today)).toEqual([]);
  });
});

describe("closureOn", () => {
  it("finds the closure covering a date that starts today", () => {
    expect(closureOn([startsToday], "2026-09-25")).toBe(startsToday);
  });

  it("finds the closure covering a date that ends today", () => {
    expect(closureOn([endsToday], "2026-09-25")).toBe(endsToday);
  });

  it("is null for a date the day before a closure starts", () => {
    expect(closureOn([future], "2026-09-30")).toBeNull();
  });

  it("is null for a date the day after a closure ends", () => {
    expect(closureOn([past], "2026-01-03")).toBeNull();
  });

  it("is null when there are no closures", () => {
    expect(closureOn([], today)).toBeNull();
  });
});
