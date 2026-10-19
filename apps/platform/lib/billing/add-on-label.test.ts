import { describe, expect, it } from "vitest";
import { addOnPaymentLabel } from "./add-on-label";

describe("addOnPaymentLabel", () => {
  it("names each monthly add-on the way its receipt does", () => {
    expect(addOnPaymentLabel("digital-growth")).toBe("Digital Growth, monthly");
    expect(addOnPaymentLabel("local-seo-aeo")).toBe("Local SEO + AEO, monthly");
    expect(addOnPaymentLabel("local-seo-aeo")).toBe("Local SEO + AEO, monthly");
  });
});
