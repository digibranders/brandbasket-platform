import { describe, expect, it } from "vitest";
import { ringFor } from "./avatar";

describe("ringFor", () => {
  it("rings money in gold, whether it is a payment to sort or a new add-on purchase", () => {
    expect(ringFor("payment")).toBe("money");
    expect(ringFor("add-on")).toBe("money");
  });

  it("rings a late preview in burgundy, and leaves a due preview and a new lead unringed", () => {
    expect(ringFor("overdue")).toBe("late");
    expect(ringFor("due")).toBeNull();
    expect(ringFor("new-lead")).toBeNull();
    expect(ringFor(undefined)).toBeNull();
  });
});
