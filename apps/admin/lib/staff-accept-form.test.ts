import { describe, expect, it } from "vitest";
import { parseStaffAcceptForm } from "./staff-accept-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const GOOD = { name: " Nikhil Jain ", password: "a-long-pass-7!", confirm: "a-long-pass-7!" };

describe("parseStaffAcceptForm", () => {
  it("reads a trimmed name and a password that meets the rule", () => {
    expect(parseStaffAcceptForm(form(GOOD))).toEqual({ ok: true, name: "Nikhil Jain", password: "a-long-pass-7!" });
  });

  it("asks for a name", () => {
    expect(parseStaffAcceptForm(form({ ...GOOD, name: "  " }))).toEqual({ ok: false, field: "name", message: "Enter your name." });
  });

  it("applies the shared password rule", () => {
    expect(parseStaffAcceptForm(form({ ...GOOD, password: "short", confirm: "short" }))).toEqual({ ok: false, field: "password", message: "Use at least 8 characters." });
  });

  it("asks for the same password twice", () => {
    expect(parseStaffAcceptForm(form({ ...GOOD, confirm: "a-long-pass-8!" }))).toEqual({ ok: false, field: "confirm", message: "The two passwords don't match." });
  });
});
