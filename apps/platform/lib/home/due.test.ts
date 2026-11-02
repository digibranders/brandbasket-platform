import { describe, expect, it } from "vitest";
import { stillAhead } from "./due";

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
