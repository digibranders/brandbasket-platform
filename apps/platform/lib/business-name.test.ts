import { describe, expect, it } from "vitest";
import { readBusinessName } from "./business-name";
import { JOIN_BUSINESS_NAME_MAX_LENGTH } from "./join-form";

function form(businessName: string): FormData {
  const data = new FormData();
  data.append("businessName", businessName);
  return data;
}

describe("readBusinessName", () => {
  it("returns the name as one clean line, and its slug", () => {
    expect(readBusinessName(form("  Smile Dental &\n Implant  Clinic "))).toEqual({
      success: true,
      businessName: "Smile Dental & Implant Clinic",
      slug: "smile-dental-and-implant-clinic",
    });
  });

  it("requires a name", () => {
    expect(readBusinessName(form("   "))).toEqual({ success: false, message: "Enter your business's name." });
    expect(readBusinessName(new FormData())).toMatchObject({ success: false });
  });

  it("requires a name that can be written in a web address", () => {
    expect(readBusinessName(form("!!!"))).toEqual({ success: false, message: "Use letters or numbers in your business's name." });
  });

  it("limits the name's length", () => {
    expect(readBusinessName(form("a".repeat(JOIN_BUSINESS_NAME_MAX_LENGTH + 1)))).toEqual({ success: false, message: "That business name is too long." });
  });
});
