import type { StaffPaymentRow } from "@brandbasket/db";
import { listPaymentsForStaff } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn(), logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listPaymentsForStaff: vi.fn() };
});

const PAID: StaffPaymentRow = {
  id: "p1",
  businessId: "b1",
  businessName: "Sai Dental Care",
  provider: "razorpay",
  providerPaymentId: "pay_1",
  kind: "renewal",
  amountCents: 3_039_800,
  currency: "INR",
  status: "captured",
  paidAt: new Date("2026-11-26T03:44:00.000Z"),
  createdAt: new Date("2026-11-26T03:44:00.000Z"),
  method: "upi",
  failureReason: null,
  attentionReason: null,
  attentionResolvedAt: null,
  recordedByName: null,
  refundedAmountCents: null,
  refundReason: null,
  invoiceNumber: "FY/26-27/000031",
};

const request = (query: string): Request => new Request(`http://admin.test/payments/export${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as never);
  vi.mocked(listPaymentsForStaff).mockResolvedValue([PAID]);
});

describe("GET /payments/export", () => {
  it("refuses anyone who is not staff, before reading anything", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "signed-out" } as never);
    expect((await GET(request("?month=2026-11"))).status).toBe(401);
    expect(listPaymentsForStaff).not.toHaveBeenCalled();
  });

  it("refuses support staff and records the refusal", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as never);
    expect((await GET(request("?month=2026-11"))).status).toBe(403);
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
  });

  it("refuses a month that is not a month", async () => {
    expect((await GET(request("?month=nope"))).status).toBe(400);
  });

  it("sends the month's payments as a private CSV after recording the export", async () => {
    const response = await GET(request("?month=2026-11"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(/attachment; filename=".+-payments-2026-11\.csv"/);
    const text = await response.text();
    expect(text.startsWith("Date,Client,")).toBe(true);
    expect(text).toContain("Sai Dental Care");
    expect(listPaymentsForStaff).toHaveBeenCalledWith(
      { name: "staff-db" },
      { from: new Date("2026-11-01T00:00:00+05:30"), to: new Date("2026-12-01T00:00:00+05:30"), limit: 5000 },
    );
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "payment.export", targetType: "payments", targetId: "2026-11", detail: "rows=1" });
  });

  it("sends nothing when the export cannot be recorded", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("db down"));
    expect((await GET(request("?month=2026-11"))).status).toBe(500);
  });
});
