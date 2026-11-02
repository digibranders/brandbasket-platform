import { describe, expect, it } from "vitest";
import { parseStaffCodeForm, wrongCodeMessage } from "./staff-sign-in-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("parseStaffCodeForm", () => {
  it("takes the spaces out of a code typed as '482 913'", () => {
    expect(parseStaffCodeForm(form({ otpId: " id-1 ", code: " 482 913\n" }))).toEqual({ otpId: "id-1", code: "482913" });
  });

  it("reads missing fields as empty", () => {
    expect(parseStaffCodeForm(new FormData())).toEqual({ otpId: "", code: "" });
  });
});

describe("wrongCodeMessage", () => {
  it("counts the tries left", () => {
    expect(wrongCodeMessage(3)).toBe("That code isn’t right. 3 tries left.");
    expect(wrongCodeMessage(1)).toBe("That code isn’t right. 1 try left.");
  });

  it("asks for six digits when the input was not a code", () => {
    expect(wrongCodeMessage(null)).toBe("Enter the 6-digit code from your email.");
  });
});
