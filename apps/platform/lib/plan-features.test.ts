import { describe, expect, it } from "vitest";
import { MEMBERSHIP_TIERS } from "./plan-features";

describe("the plan sold", () => {
  it("is the one plan sold", () => {
    expect(MEMBERSHIP_TIERS).toEqual(["managed"]);
  });
});
