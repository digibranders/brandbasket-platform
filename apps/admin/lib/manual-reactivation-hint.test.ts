import { describe, expect, it } from "vitest";
import { couponPhrase } from "./manual-reactivation-hint";

describe("couponPhrase", () => {
  it("says there is no coupon when none is carried", () => {
    expect(couponPhrase(null)).toBe("with no coupon");
  });

  it("names the code and the months it has left", () => {
    expect(couponPhrase({ code: "THREE", monthsLeft: 2 })).toBe("with their code THREE taken off (2 months left)");
    expect(couponPhrase({ code: "THREE", monthsLeft: 1 })).toBe("with their code THREE taken off (1 month left)");
  });

  it("names the code alone when it has no limit", () => {
    expect(couponPhrase({ code: "FOREVER", monthsLeft: null })).toBe("with their code FOREVER taken off");
  });
});
