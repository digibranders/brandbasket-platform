import { describe, expect, it, vi } from "vitest";
import { parseNomineeForm } from "./nominee";

vi.mock("server-only", () => ({}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseNomineeForm", () => {
  it("cleans the name and turns an Indian number, however it is spaced, into E.164", () => {
    expect(parseNomineeForm(form({ name: "  Meera   Rao ", phone: "98765 43210" }), null)).toEqual({ success: true, name: "Meera Rao", phone: "+919876543210" });
    expect(parseNomineeForm(form({ name: "Meera", phone: "+91 98765-43210" }), null)).toMatchObject({ success: true, phone: "+919876543210" });
  });

  it("names the field to put right", () => {
    expect(parseNomineeForm(form({ name: "", phone: "9876543210" }), null)).toMatchObject({ success: false, field: "name" });
    expect(parseNomineeForm(form({ name: "n".repeat(121), phone: "9876543210" }), null)).toMatchObject({ success: false, field: "name" });
    expect(parseNomineeForm(form({ name: "Meera", phone: "" }), null)).toMatchObject({ success: false, field: "phone" });
    expect(parseNomineeForm(form({ name: "Meera", phone: "12345" }), null)).toMatchObject({ success: false, field: "phone" });
  });

  it("refuses the account's own number as the nominee", () => {
    expect(parseNomineeForm(form({ name: "Me", phone: "98765 43210" }), "+919876543210")).toMatchObject({ success: false, field: "phone" });
    expect(parseNomineeForm(form({ name: "Meera", phone: "98765 43210" }), "+919811111111")).toMatchObject({ success: true });
  });
});
