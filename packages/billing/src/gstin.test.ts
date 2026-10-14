import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { gstinCheckCharacter, InvalidGstinError, isValidGstin, normaliseGstin, stateCodeOfGstin } from "./gstin";

describe("GSTIN", () => {
  it("accepts real GSTINs", () => {
    expect(isValidGstin("27AAICD9268J1Z0")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
  });

  it("refuses a body that is not 14 GSTIN characters, without echoing the characters", () => {
    expect(() => gstinCheckCharacter("27AAICD9268J1")).toThrow(BillingRangeError);
    const lowerCase = "27aaicd9268j1z";
    expect(() => gstinCheckCharacter(lowerCase)).toThrow(BillingRangeError);
    expect(() => gstinCheckCharacter(lowerCase)).toThrow(expect.objectContaining({ message: expect.not.stringContaining("aaicd") }));
  });

  it("works out the check character", () => {
    expect(gstinCheckCharacter("27AAICD9268J1Z")).toBe("0");
    expect(gstinCheckCharacter("29AAPFU0939F1Z")).toBe("R");
  });

  it("refuses a wrong check character, a bad shape and a state code that is not a state", () => {
    expect(isValidGstin("29AAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(false);
    const body = "97AAPFU0939F1Z";
    expect(isValidGstin(body + gstinCheckCharacter(body))).toBe(false);
  });

  it("normalises what people type: spaces out, upper case", () => {
    expect(normaliseGstin(" 27aapfu 0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });

  it("names the state a GSTIN is registered in", () => {
    expect(stateCodeOfGstin("27AAPFU0939F1ZV")).toBe("mh");
    expect(() => stateCodeOfGstin("29AAPFU0939F1ZV")).toThrow(InvalidGstinError);
  });

  it("keeps the GSTIN out of its error, so logging the error never logs a customer's GSTIN", () => {
    expect(() => stateCodeOfGstin("29AAPFU0939F1ZV")).toThrow(/^Not a valid GSTIN$/);
  });
});
