import { describe, expect, it } from "vitest";
import { addOnPaymentLabel } from "./add-on-label";

describe("addOnPaymentLabel", () => {
  it("names each monthly add-on the way its receipt does", () => {
    expect(addOnPaymentLabel("local-seo")).toBe("Local SEO, monthly");
    expect(addOnPaymentLabel("performance-marketing")).toBe("Performance marketing, monthly");
  });
});
