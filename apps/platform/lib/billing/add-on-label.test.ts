import { describe, expect, it } from "vitest";
import { addOnPaymentLabel } from "./add-on-label";

describe("addOnPaymentLabel", () => {
  it("names each monthly add-on the way its receipt does", () => {
    expect(addOnPaymentLabel("social-media")).toBe("Social media, monthly");
    expect(addOnPaymentLabel("lead-generation")).toBe("Outreach and lead generation, monthly");
    expect(addOnPaymentLabel("advertising")).toBe("Paid advertising, monthly");
  });
});
