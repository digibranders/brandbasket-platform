import { describe, expect, it } from "vitest";
import { isPastIncludedRounds } from "./build-rounds";

describe("isPastIncludedRounds", () => {
  it("is true only when more rounds were asked for than are included", () => {
    expect(isPastIncludedRounds(3, 2)).toBe(true);
    expect(isPastIncludedRounds(1, 0)).toBe(true);
  });

  it("is false while the rounds asked for are within the allowance", () => {
    expect(isPastIncludedRounds(2, 2)).toBe(false);
    expect(isPastIncludedRounds(0, 2)).toBe(false);
  });
});
