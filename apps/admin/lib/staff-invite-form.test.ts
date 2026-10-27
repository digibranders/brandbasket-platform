import { describe, expect, it } from "vitest";
import { parseStaffInviteForm, parseStaffRole, STAFF_INVITE_EXPIRY_DAYS } from "./staff-invite-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

describe("parseStaffInviteForm", () => {
  it("reads a work email, trimmed and lower case, and a role", () => {
    expect(parseStaffInviteForm(form({ email: "  Nikhil@BrandBasket.in ", role: "support" }))).toEqual({ ok: true, email: "nikhil@brandbasket.in", role: "support" });
  });

  it("refuses a missing or broken email and an unknown role", () => {
    expect(parseStaffInviteForm(form({ email: "", role: "support" })).ok).toBe(false);
    expect(parseStaffInviteForm(form({ email: "not-an-email", role: "support" })).ok).toBe(false);
    expect(parseStaffInviteForm(form({ email: "a@b.in", role: "owner" })).ok).toBe(false);
  });

  it("lasts three days", () => {
    expect(STAFF_INVITE_EXPIRY_DAYS).toBe(3);
  });
});

describe("parseStaffRole", () => {
  it("accepts only the three roles", () => {
    expect(parseStaffRole("finance")).toBe("finance");
    expect(parseStaffRole("root")).toBeNull();
    expect(parseStaffRole(null)).toBeNull();
  });
});
