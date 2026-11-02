import { describe, expect, it } from "vitest";
import { dayStillAhead, stillAhead } from "./due";

const NOW = new Date("2026-11-02T04:00:00Z");

describe("stillAhead", () => {
  it("keeps a date that has not come yet", () => {
    const due = new Date("2026-11-03T04:00:00Z");
    expect(stillAhead(due, NOW)).toBe(due);
  });

  it("drops a date that has passed, or is exactly now", () => {
    expect(stillAhead(new Date("2026-10-31T05:00:00Z"), NOW)).toBeNull();
    expect(stillAhead(NOW, NOW)).toBeNull();
  });

  it("passes null through", () => {
    expect(stillAhead(null, NOW)).toBeNull();
  });
});

describe("dayStillAhead", () => {
  it("keeps today and later days, in India's time", () => {
    expect(dayStillAhead("2026-11-02", NOW)).toBe("2026-11-02");
    expect(dayStillAhead("2026-11-09", NOW)).toBe("2026-11-09");
    // 20:00 UTC on the 2nd is already the 3rd in India.
    expect(dayStillAhead("2026-11-02", new Date("2026-11-02T20:00:00Z"))).toBeNull();
  });

  it("drops a day that has passed, and passes null through", () => {
    expect(dayStillAhead("2026-11-01", NOW)).toBeNull();
    expect(dayStillAhead(null, NOW)).toBeNull();
  });
});
