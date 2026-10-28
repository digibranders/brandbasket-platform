import { describe, expect, it } from "vitest";
import { compare, describeChange } from "./delta";

describe("compare", () => {
  it("says which way a figure moved and by how much", () => {
    expect(compare(21, 15)).toEqual({ direction: "up", amount: 6 });
    expect(compare(168, 214)).toEqual({ direction: "down", amount: 46 });
    expect(compare(9, 9)).toEqual({ direction: "same", amount: 0 });
  });

  it("says nothing when either month was not measured", () => {
    expect(compare(21, null)).toBeNull();
    expect(compare(null, 15)).toBeNull();
    expect(compare(null, null)).toBeNull();
  });

  it("treats a measured zero as a real figure", () => {
    expect(compare(5, 0)).toEqual({ direction: "up", amount: 5 });
    expect(compare(0, 5)).toEqual({ direction: "down", amount: 5 });
  });
});

describe("describeChange", () => {
  it("words a rise, a fall and no change with the same plainness", () => {
    expect(describeChange({ direction: "up", amount: 6 }, "September")).toBe("6 more than September");
    expect(describeChange({ direction: "down", amount: 46 }, "September")).toBe("46 fewer than September");
    expect(describeChange({ direction: "same", amount: 0 }, "September")).toBe("Same as September");
  });

  it("groups big numbers the Indian way", () => {
    expect(describeChange({ direction: "up", amount: 12000 }, "September")).toBe("12,000 more than September");
    expect(describeChange({ direction: "up", amount: 150000 }, "September")).toBe("1,50,000 more than September");
  });

  it("has no words for a change that cannot be stated", () => {
    expect(describeChange(null, "September")).toBeNull();
  });
});
