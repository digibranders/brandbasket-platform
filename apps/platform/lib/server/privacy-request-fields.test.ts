import { describe, expect, it, vi } from "vitest";
import type { PrivacyRequestOtpRequest } from "@/lib/privacy-requests-api";
import { parsePrivacyRequestFields } from "./privacy-request-fields";

vi.mock("server-only", () => ({}));

function request(overrides: Partial<PrivacyRequestOtpRequest> = {}): PrivacyRequestOtpRequest {
  return { kind: "access", name: "  Meera Rao ", phone: { country: "IN", number: "98765 43210" }, details: "", website: "", clientIp: "203.0.113.9", ...overrides };
}

describe("parsePrivacyRequestFields", () => {
  it("cleans the name and number, and leaves empty optional fields null", () => {
    expect(parsePrivacyRequestFields(request({ noticeVersion: "2026-10-13" }))).toEqual({
      success: true,
      data: { kind: "access", name: "Meera Rao", phone: "+919876543210", details: null, noticeVersion: "2026-10-13" },
    });
    expect(parsePrivacyRequestFields(request({ name: "   " }))).toMatchObject({ success: true, data: { name: null, noticeVersion: null } });
  });

  it("needs the words for a correction or a grievance, but not for the other kinds", () => {
    for (const kind of ["correction", "grievance"] as const) {
      expect(parsePrivacyRequestFields(request({ kind }))).toMatchObject({ success: false, field: "details" });
    }
    for (const kind of ["access", "erasure", "nomination"] as const) {
      expect(parsePrivacyRequestFields(request({ kind }))).toMatchObject({ success: true });
    }
    expect(parsePrivacyRequestFields(request({ kind: "grievance", details: " My number was shown. " }))).toMatchObject({ success: true, data: { details: "My number was shown." } });
  });

  it("names the one field to put right", () => {
    expect(parsePrivacyRequestFields(request({ phone: { country: "IN", number: "" } }))).toMatchObject({ success: false, field: "phone" });
    expect(parsePrivacyRequestFields(request({ phone: { country: "IN", number: "12345" } }))).toMatchObject({ success: false, field: "phone" });
    expect(parsePrivacyRequestFields(request({ name: "n".repeat(201) }))).toMatchObject({ success: false, field: "name" });
    expect(parsePrivacyRequestFields(request({ details: "d".repeat(2001) }))).toMatchObject({ success: false, field: "details" });
  });
});
