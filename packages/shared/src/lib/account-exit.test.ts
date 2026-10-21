import { describe, expect, it } from "vitest";
import * as accountExit from "./account-exit";
import { EXIT_REASON_OPTIONS, isExitReason } from "./account-exit";

describe("the exit reasons", () => {
  it("lists every reason once, with a label", () => {
    expect(EXIT_REASON_OPTIONS.map((option) => option.value)).toEqual([
      "too_expensive",
      "not_enough_enquiries",
      "not_using",
      "missing_feature",
      "found_alternative",
      "closing_business",
      "other",
    ]);
    expect(EXIT_REASON_OPTIONS.every((option) => option.label.length > 0)).toBe(true);
  });

  it("recognises a reason and nothing else", () => {
    expect(isExitReason("too_expensive")).toBe(true);
    expect(isExitReason("toString")).toBe(false);
    expect(isExitReason("")).toBe(false);
    expect(isExitReason(undefined)).toBe(false);
  });

  it("offers no reason a discount: the module has no stay offer to read", () => {
    expect(accountExit).not.toHaveProperty("retentionOfferPercent");
    expect(accountExit).not.toHaveProperty("retentionDiscountCentsFor");
    expect(EXIT_REASON_OPTIONS.every((option) => Object.keys(option).sort().join() === "label,value")).toBe(true);
  });
});
