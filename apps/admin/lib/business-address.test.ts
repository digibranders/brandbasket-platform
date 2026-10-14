import { describe, expect, it } from "vitest";
import { businessUrlCode } from "@fynix/shared/lib/directory/place-id";
import { businessAddressOf } from "./business-address";

const PLACE = { id: "k7m2q9a", stateCode: "mh", urlSlug: "smile-dental" };

describe("businessAddressOf", () => {
  it("is the place's web address, carrying its URL code and not its id, when the business has a place", () => {
    const address = businessAddressOf(PLACE, "dentists/thane/naupada/smile-dental-clinic");
    expect(address).toBe(`https://fynix.digital/in/mh/business/smile-dental/${businessUrlCode("k7m2q9a")}`);
    expect(address).not.toContain("k7m2q9a");
  });

  it("is the category's page in the business's area without one", () => {
    expect(businessAddressOf(null, "beauty-salons/kalyan-dombivli/ankharpada/y")).toBe(
      "https://fynix.digital/in/mh/thane/ankharpada/beauty-salons",
    );
  });

  it("refuses something that is not a listing key", () => {
    expect(() => businessAddressOf(null, "nope")).toThrow(/Not a listing key/);
  });
});
