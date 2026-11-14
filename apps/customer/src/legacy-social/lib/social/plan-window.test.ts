import { describe, expect, it } from "vitest";
import { dayAfter, firstStartDay, nextStartDay, renewalDay } from "./plan-window";

describe("plan window", () => {
  it("steps to the next day across a month end", () => {
    expect(dayAfter("2026-11-30")).toBe("2026-12-01");
  });

  it("starts the first plan tomorrow, not on the next Monday", () => {
    expect(firstStartDay("2026-11-20")).toBe("2026-11-21");
  });

  it("starts a further month on the renewal day when that is later than the usual start", () => {
    expect(nextStartDay({ today: "2026-12-05", earliest: "2026-12-14", renewsOn: "2026-12-16" })).toBe("2026-12-16");
  });

  it("never starts before the usual start, so plans do not overlap", () => {
    expect(nextStartDay({ today: "2026-12-05", earliest: "2026-12-14", renewsOn: "2026-12-11" })).toBe("2026-12-14");
  });

  it("never starts before tomorrow", () => {
    expect(nextStartDay({ today: "2026-12-14", earliest: "2026-12-07", renewsOn: null })).toBe("2026-12-15");
  });

  it("starts on the usual day when the renewal is not known", () => {
    expect(nextStartDay({ today: "2026-12-05", earliest: "2026-12-14", renewsOn: null })).toBe("2026-12-14");
  });

  it("reads the renewal day from the paid-through moment, and nothing without one", () => {
    expect(renewalDay(new Date("2026-12-14T00:00:00Z"), (at) => at.toISOString().slice(0, 10))).toBe("2026-12-14");
    expect(renewalDay(null, () => "x")).toBeNull();
  });
});
