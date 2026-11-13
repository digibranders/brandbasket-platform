import { describe, expect, it } from "vitest";
import { flagIsOn, isCustomerVisitsEnabled, isEnquiryFormContentsEnabled } from "./launch-flags";

describe("launch flags", () => {
  it("are off when unset, empty or anything but a clear yes", () => {
    for (const value of [undefined, "", "0", "false", "off", "no", "enabled", "2"]) expect(flagIsOn(value)).toBe(false);
  });

  it("are on for 1, true, on and yes, in any case and with spaces", () => {
    for (const value of ["1", "true", "TRUE", " on ", "Yes"]) expect(flagIsOn(value)).toBe(true);
  });

  it("reads its own variable", () => {
    expect(isEnquiryFormContentsEnabled({ ENQUIRY_FORM_CONTENTS_ENABLED: "true" })).toBe(true);
    expect(isEnquiryFormContentsEnabled({})).toBe(false);
    expect(isCustomerVisitsEnabled({ CUSTOMER_VISITS_ENABLED: "1" })).toBe(true);
    expect(isCustomerVisitsEnabled({ ENQUIRY_FORM_CONTENTS_ENABLED: "1" })).toBe(false);
    expect(isCustomerVisitsEnabled({})).toBe(false);
  });
});
