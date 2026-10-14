import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { displayPhone, displayPhoneText, maskPhone } = await import("./phone-display");

describe("displayPhone", () => {
  it("lays out an E.164 number internationally and dials it as stored", () => {
    expect(displayPhone("+919876543210")).toEqual({ text: "+91 98765 43210", href: "tel:+919876543210" });
    expect(displayPhone("+442079460958")).toEqual({ text: "+44 20 7946 0958", href: "tel:+442079460958" });
  });

  it("reads an older number that already had its country code", () => {
    expect(displayPhone("+91 98765-43210")).toEqual({ text: "+91 98765 43210", href: "tel:+919876543210" });
  });

  it("shows an older number without a country code as it was typed", () => {
    expect(displayPhone("(020) 7946 0958")).toEqual({ text: "(020) 7946 0958", href: "tel:02079460958" });
  });

  it("offers no link when there is nothing to dial", () => {
    expect(displayPhone("ask at reception")).toEqual({ text: "ask at reception", href: null });
  });
});

describe("displayPhoneText", () => {
  it("keeps a missing number missing", () => {
    expect(displayPhoneText(null)).toBeNull();
    expect(displayPhoneText("")).toBe("");
    expect(displayPhoneText("+919876543210")).toBe("+91 98765 43210");
  });
});

describe("maskPhone", () => {
  it("keeps the country code and the last three digits only", () => {
    expect(maskPhone("+919876543210")).toBe("+91 ••••••• 210");
    expect(maskPhone("+442079460958")).toBe("+44 ••••••• 958");
  });

  it("hides a value that is not a number altogether", () => {
    expect(maskPhone("ask at reception")).toBe("••••••••••");
  });
});
