import { describe, expect, it, vi } from "vitest";
import { parseAccountIdentifier, parseCustomerSignInForm } from "./customer-sign-in-form";

vi.mock("server-only", () => ({}));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseAccountIdentifier", () => {
  it("reads a mobile number, as an Indian one unless it carries a country code", () => {
    expect(parseAccountIdentifier(" 98200 11223 ")).toEqual({ success: true, identifier: { kind: "phone", phone: "+919820011223" } });
    expect(parseAccountIdentifier("+91 98200-11223")).toEqual({ success: true, identifier: { kind: "phone", phone: "+919820011223" } });
  });

  it("reads anything with an @ as an email, trimmed and lowercased", () => {
    expect(parseAccountIdentifier(" Meera@Example.com ")).toEqual({ success: true, identifier: { kind: "email", email: "meera@example.com" } });
  });

  it("does not take a phone account's placeholder address: that account signs in with its number", () => {
    expect(parseAccountIdentifier("919820011223@phone.fynix.invalid")).toEqual({ success: false, message: "Enter your mobile number." });
  });

  it("asks for one when empty", () => {
    expect(parseAccountIdentifier("  ")).toEqual({ success: false, message: "Enter your mobile number." });
  });

  it("asks for an email address instead when told the brand signs in with one", () => {
    expect(parseAccountIdentifier("  ", "email")).toEqual({ success: false, message: "Enter your email address." });
    expect(parseAccountIdentifier("919820011223@phone.fynix.invalid", "email")).toEqual({ success: false, message: "Enter your email address." });
    expect(parseAccountIdentifier("Meera@Example.com", "email")).toEqual({ success: true, identifier: { kind: "email", email: "meera@example.com" } });
  });

  it("refuses a number that is not one, and an email that is not one", () => {
    expect(parseAccountIdentifier("12345")).toMatchObject({ success: false });
    expect(parseAccountIdentifier("meera@")).toEqual({ success: false, message: "Enter a valid email address." });
  });
});

describe("parseCustomerSignInForm", () => {
  it("reads a number and a password", () => {
    expect(parseCustomerSignInForm(form({ identifier: "98200 11223", password: "correct-horse-battery" }))).toEqual({
      success: true,
      data: { identifier: { kind: "phone", phone: "+919820011223" }, password: "correct-horse-battery" },
    });
  });

  it("asks a Fynix sign-in for its email, and reads one", () => {
    expect(parseCustomerSignInForm(form({ identifier: "", password: "x" }), "email")).toMatchObject({ success: false, message: "Enter your email address." });
    expect(parseCustomerSignInForm(form({ identifier: "Owner@Example.test", password: "correct-horse-battery" }), "email")).toEqual({
      success: true,
      data: { identifier: { kind: "email", email: "owner@example.test" }, password: "correct-horse-battery" },
    });
  });

  it("echoes what was typed when it cannot be read", () => {
    expect(parseCustomerSignInForm(form({ identifier: " 12345 ", password: "x" }))).toMatchObject({ success: false, typed: "12345" });
  });

  it("asks for the password", () => {
    expect(parseCustomerSignInForm(form({ identifier: "98200 11223", password: "" }))).toEqual({
      success: false,
      message: "Enter your password.",
      typed: "98200 11223",
    });
  });
});
