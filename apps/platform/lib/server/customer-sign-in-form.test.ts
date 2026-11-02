import { describe, expect, it, vi } from "vitest";
import { parseAccountIdentifier, parseCustomerSignInForm } from "./customer-sign-in-form";

vi.mock("server-only", () => ({}));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const MISSING = "Enter your email or mobile number.";
const INVALID = "Enter a valid email address or mobile number.";

describe("parseAccountIdentifier", () => {
  it.each([
    ["10 digits", "9820011223"],
    ["spaces", " 98200 11223 "],
    ["dashes", "98200-11223"],
    ["+91 and a space", "+91 98200 11223"],
    ["+91 and dashes", "+91-98200-11223"],
    ["+91 and no space", "+919820011223"],
    ["91 with the 00 prefix", "0091 98200 11223"],
    ["a leading zero", "09820011223"],
  ])("reads a mobile number with %s as Indian E.164", (_name, typed) => {
    expect(parseAccountIdentifier(typed)).toEqual({ success: true, identifier: { kind: "phone", phone: "+919820011223" } });
  });

  it("reads a number with another country code as that country's", () => {
    expect(parseAccountIdentifier("+1 415 555 2671")).toEqual({ success: true, identifier: { kind: "phone", phone: "+14155552671" } });
  });

  it("reads anything with an @ as an email, trimmed and lowercased", () => {
    expect(parseAccountIdentifier(" Meera@Example.com ")).toEqual({ success: true, identifier: { kind: "email", email: "meera@example.com" } });
  });

  it("does not take a phone account's placeholder address", () => {
    expect(parseAccountIdentifier("919820011223@phone.brandbasket.invalid")).toEqual({ success: false, message: INVALID });
  });

  it("asks for one when empty", () => {
    expect(parseAccountIdentifier("")).toEqual({ success: false, message: MISSING });
    expect(parseAccountIdentifier("  ")).toEqual({ success: false, message: MISSING });
  });

  it.each(["12345", "hello", "98200 11223 ext 4", "+91 12345", "9820011223x", "()", "-"])("refuses %j with one message that covers both", (typed) => {
    expect(parseAccountIdentifier(typed)).toEqual({ success: false, message: INVALID });
  });

  it("refuses an email that is not one, and one that is too long", () => {
    expect(parseAccountIdentifier("meera@")).toEqual({ success: false, message: "Enter a valid email address." });
    expect(parseAccountIdentifier(`${"a".repeat(250)}@example.com`)).toEqual({ success: false, message: "That email address is too long." });
  });
});

describe("parseCustomerSignInForm", () => {
  it("reads a number and a password", () => {
    expect(parseCustomerSignInForm(form({ identifier: "98200 11223", password: "correct-horse-battery" }))).toEqual({
      success: true,
      data: { identifier: { kind: "phone", phone: "+919820011223" }, password: "correct-horse-battery" },
    });
  });

  it("reads an email and a password", () => {
    expect(parseCustomerSignInForm(form({ identifier: "Owner@Example.test", password: "correct-horse-battery" }))).toEqual({
      success: true,
      data: { identifier: { kind: "email", email: "owner@example.test" }, password: "correct-horse-battery" },
    });
  });

  it("asks for an email or a mobile number when the field is empty", () => {
    expect(parseCustomerSignInForm(form({ identifier: "", password: "x" }))).toMatchObject({ success: false, message: MISSING });
  });

  it("echoes what was typed when it cannot be read", () => {
    expect(parseCustomerSignInForm(form({ identifier: " 12345 ", password: "x" }))).toMatchObject({ success: false, message: INVALID, typed: "12345" });
  });

  it("asks for the password", () => {
    expect(parseCustomerSignInForm(form({ identifier: "98200 11223", password: "" }))).toEqual({
      success: false,
      message: "Enter your password.",
      typed: "98200 11223",
    });
  });
});
