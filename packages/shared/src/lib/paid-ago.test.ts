import { describe, expect, it } from "vitest";
import { formatPaidAgo } from "./paid-ago";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatPaidAgo", () => {
  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [MIN, "1 min ago"],
    [14 * MIN + 30_000, "14 min ago"],
    [59 * MIN + 59_000, "59 min ago"],
    [HOUR, "1 h ago"],
    [2 * HOUR + 14 * MIN, "2 h ago"],
    [23 * HOUR + 59 * MIN, "23 h ago"],
    [DAY, "1 day ago"],
    [2 * DAY + 5 * HOUR, "2 days ago"],
    [30 * DAY, "30 days ago"],
  ])("reads %i ms as %s", (elapsed, text) => {
    expect(formatPaidAgo(elapsed)).toBe(text);
  });

  it("never goes negative when the browser's clock is behind the payment time", () => {
    expect(formatPaidAgo(-5 * MIN)).toBe("just now");
    expect(formatPaidAgo(Number.NaN)).toBe("just now");
  });
});
