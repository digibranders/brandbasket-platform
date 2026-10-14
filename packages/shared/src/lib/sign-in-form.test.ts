import { describe, expect, it } from "vitest";
import { parseSignInForm, typedSignInIdentifier } from "./sign-in-form";

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseSignInForm", () => {
  it("accepts a valid email and password, normalising the email", () => {
    expect(parseSignInForm(form({ email: "  Owner@Example.COM ", password: "secret-pass" }))).toEqual({
      success: true,
      data: { email: "owner@example.com", password: "secret-pass" },
    });
  });

  it("asks for an email when it is missing", () => {
    expect(parseSignInForm(form({ email: " ", password: "secret-pass" }))).toEqual({
      success: false,
      message: "Enter your email address.",
      email: "",
    });
  });

  it("rejects a malformed email and echoes what was typed", () => {
    expect(parseSignInForm(form({ email: "owner@", password: "secret-pass" }))).toEqual({
      success: false,
      message: "Enter a valid email address.",
      email: "owner@",
    });
  });

  it("asks for a password when it is missing", () => {
    expect(parseSignInForm(form({ email: "owner@example.com", password: "" }))).toMatchObject({
      success: false,
      message: "Enter your password.",
    });
  });

  it("treats uploaded files as empty values", () => {
    expect(parseSignInForm(form({ email: new Blob(["x"]), password: "secret-pass" }))).toMatchObject({
      success: false,
      message: "Enter your email address.",
    });
  });
});

describe("typedSignInIdentifier", () => {
  it("gives back what was typed, trimmed, so a refusal before parsing keeps the field filled", () => {
    const data = new FormData();
    data.set("email", "  98200 11223 ");
    expect(typedSignInIdentifier(data)).toBe("98200 11223");
  });

  it("is empty when the field was not sent", () => {
    expect(typedSignInIdentifier(new FormData())).toBe("");
  });
});
