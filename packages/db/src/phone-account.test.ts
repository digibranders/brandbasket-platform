import { describe, expect, it } from "vitest";
import { isPhoneAccountEmail, phoneAccountEmail } from "./phone-account";

describe("phoneAccountEmail", () => {
  it("makes the placeholder address of an account opened with a phone number", () => {
    expect(phoneAccountEmail("+919820011223")).toBe("919820011223@phone.fynix.invalid");
  });

  it("refuses anything that is not a full international number", () => {
    expect(() => phoneAccountEmail("9820011223")).toThrow(RangeError);
  });
});

describe("isPhoneAccountEmail", () => {
  it("knows a placeholder from a real address", () => {
    expect(isPhoneAccountEmail("919820011223@phone.fynix.invalid")).toBe(true);
    expect(isPhoneAccountEmail("919820011223@PHONE.fynix.invalid")).toBe(true);
    expect(isPhoneAccountEmail("owner@example.com")).toBe(false);
    expect(isPhoneAccountEmail("owner@phone.fynix.invalid.example.com")).toBe(false);
  });
});
