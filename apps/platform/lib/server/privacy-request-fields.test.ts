import { describe, expect, it, vi } from "vitest";
import type { PrivacyRequestOtpRequest } from "@/lib/privacy-requests-api";
import { parsePrivacyRequestFields } from "./privacy-request-fields";

vi.mock("server-only", () => ({}));

function request(overrides: Partial<PrivacyRequestOtpRequest> = {}): PrivacyRequestOtpRequest {
  return { kind: "access", name: "  Meera Rao ", email: "  Meera@Example.com ", details: "", website: "", clientIp: "203.0.113.9", ...overrides };
}

describe("parsePrivacyRequestFields", () => {
  it("cleans the name and address, and leaves empty optional fields null", () => {
    expect(parsePrivacyRequestFields(request({ noticeVersion: "2026-10-13" }))).toEqual({
      success: true,
      data: { kind: "access", name: "Meera Rao", email: "meera@example.com", details: null, noticeVersion: "2026-10-13" },
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
    expect(parsePrivacyRequestFields(request({ email: "" }))).toEqual({ success: false, field: "email", message: "Enter the email address we should send the code to." });
    expect(parsePrivacyRequestFields(request({ email: "meera" }))).toMatchObject({ success: false, field: "email", message: "Enter a valid email address." });
    expect(parsePrivacyRequestFields(request({ email: `${"m".repeat(250)}@x.co` }))).toMatchObject({ success: false, field: "email" });
    expect(parsePrivacyRequestFields(request({ name: "n".repeat(201) }))).toMatchObject({ success: false, field: "name" });
    expect(parsePrivacyRequestFields(request({ details: "d".repeat(2001) }))).toMatchObject({ success: false, field: "details" });
  });

  it("asks for an email address, not a phone number: nothing about a request is texted", () => {
    expect(parsePrivacyRequestFields(request({ email: "98765 43210" }))).toMatchObject({ success: false, field: "email" });
    expect(JSON.stringify(parsePrivacyRequestFields(request({ email: "" })))).not.toMatch(/mobile|phone|text/i);
  });
});
