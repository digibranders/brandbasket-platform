import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAccess, type Database } from "@brandbasket/db";
import { logStaffAccess, logStaffAccessOrThrow } from "./staff-access-log";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({}) as Database) }));
vi.mock("@brandbasket/db", () => ({ recordStaffAccess: vi.fn(async () => undefined) }));

const BUSINESS = "0197c2a0-0000-7000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("logStaffAccess", () => {
  it("records the staff member, the action, the target and the address the request came from", async () => {
    await logStaffAccess({ staffUserId: "staff-1", action: "client.view", targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
    expect(recordStaffAccess).toHaveBeenCalledWith(expect.anything(), {
      staffUserId: "staff-1",
      action: "client.view",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
      ipAddress: "203.0.113.9",
    });
  });

  it("drops a business id that is not a UUID instead of failing the page", async () => {
    await logStaffAccess({ staffUserId: "staff-1", action: "client.view", targetId: "not-a-uuid", businessId: "not-a-uuid" });
    expect(recordStaffAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetId: "not-a-uuid", businessId: null }));
  });

  it("never blocks the page when the log cannot be written, and logs no personal data", async () => {
    vi.mocked(recordStaffAccess).mockRejectedValueOnce(new Error("connection refused for asha@brandbasket.in"));
    await expect(logStaffAccess({ staffUserId: "staff-1", action: "lead.view", targetId: "lead-1" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("asha@brandbasket.in");
  });
});

describe("logStaffAccessOrThrow", () => {
  it("writes the same record", async () => {
    await logStaffAccessOrThrow({ staffUserId: "staff-1", action: "invoice.export", detail: "month=2026-10 rows=3" });
    expect(recordStaffAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "invoice.export", detail: "month=2026-10 rows=3", ipAddress: "203.0.113.9" }));
  });

  it("fails when the log cannot be written, so an export is never served without a record", async () => {
    vi.mocked(recordStaffAccess).mockRejectedValueOnce(new Error("down"));
    await expect(logStaffAccessOrThrow({ staffUserId: "staff-1", action: "invoice.export" })).rejects.toThrow("down");
  });
});
