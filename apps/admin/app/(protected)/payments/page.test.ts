import type { StaffPaymentRow } from "@brandbasket/db";
import { listPaymentsForStaff } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import PaymentsPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listPaymentsForStaff: vi.fn() };
});

function row(overrides: Partial<StaffPaymentRow>): StaffPaymentRow {
  return {
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
    ...overrides,
  };
}

const ROWS = [
  row({ id: "paid" }),
  row({ id: "failed", businessId: "b2", businessName: "Royal Tailors", status: "failed", paidAt: null, invoiceNumber: null, amountCents: 299_900 }),
  row({ id: "flagged", businessId: "b3", businessName: "Shree Auto Works", attentionReason: "amount_mismatch", invoiceNumber: null, amountCents: 2_429_800 }),
];

const search = (params: Record<string, string>) => Promise.resolve(params);
const grant = (role: "support" | "finance") =>
  vi.mocked(requireStaffAccess).mockResolvedValue({ user: { id: "staff-2" }, staff: { userId: "staff-2", role } } as never);

beforeEach(() => {
  vi.resetAllMocks();
  grant("finance");
  vi.mocked(listPaymentsForStaff).mockResolvedValue(ROWS);
});

describe("Payments page", () => {
  it("sends support staff to the no-access page and reads nothing", async () => {
    grant("support");
    await expect(PaymentsPage({ searchParams: search({ month: "2026-11" }) })).rejects.toThrow("redirect:/no-access");
    expect(listPaymentsForStaff).not.toHaveBeenCalled();
  });

  it("lists the month's payments with figures, filters, export and the access record", async () => {
    const html = renderToStaticMarkup(await PaymentsPage({ searchParams: search({ month: "2026-11" }) }));

    expect(listPaymentsForStaff).toHaveBeenCalledWith(
      { name: "staff-db" },
      { from: new Date("2026-11-01T00:00:00+05:30"), to: new Date("2026-12-01T00:00:00+05:30"), limit: 1000 },
    );
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "payment.list_view", targetType: "payments", targetId: "2026-11" });
    expect(html).toContain("Payments");
    expect(html).toContain("November 2026");
    expect(html).toContain("Sai Dental Care");
    expect(html).toContain("Royal Tailors");
    expect(html).toContain("Needs a look");
    expect(html).toContain("Export for the CA");
    expect(html).toContain('href="/payments/export?month=2026-11"');
    expect(html).toContain('href="/payments?month=2026-11&amp;show=failed"');
    expect(html).toContain('href="/clients/b1/billing#payment-paid"');
  });

  it("shows only the chosen filter's payments", async () => {
    const html = renderToStaticMarkup(await PaymentsPage({ searchParams: search({ month: "2026-11", show: "failed" }) }));
    expect(html).toContain("Royal Tailors");
    expect(html).not.toContain("Sai Dental Care");
  });

  it("is not found for a month that is not a month", async () => {
    await expect(PaymentsPage({ searchParams: search({ month: "2026-13" }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(listPaymentsForStaff).not.toHaveBeenCalled();
  });
});
