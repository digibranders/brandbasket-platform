import type { StaffPaymentRow } from "@brandbasket/db";
import { listClients, listPaymentsForStaff, listPaymentsNeedingAttention } from "@brandbasket/db";
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listPaymentsForStaff: vi.fn(), listPaymentsNeedingAttention: vi.fn(), listClients: vi.fn() };
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
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listClients).mockResolvedValue([]);
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
    // The filter pills are buttons now (FilterBar), so the failed payment is reached through the Needs a look strip.
    expect(html).toContain('href="/payments?month=2026-11&amp;open=failed"');
    expect(html).toContain('href="/payments?month=2026-11&amp;open=flagged"');
  });

  it("never says All clear while a payment failed or a plan is overdue, and the tile adds both", async () => {
    vi.mocked(listClients).mockResolvedValue([
      {
        businessId: "b9",
        businessName: "Lapsed Traders",
        billing: {
          subscription: { status: "past_due", provider: "razorpay", billingInterval: "month", activatedAt: new Date("2026-10-01T00:00:00.000Z"), paidThroughAt: new Date("2026-11-01T00:00:00.000Z"), commitmentEndsAt: null },
          firstPayment: { amountCents: 299_900, currency: "INR", provider: "razorpay", paidAt: new Date("2026-10-01T00:00:00.000Z"), manual: null },
        },
      },
    ] as never);
    const html = renderToStaticMarkup(await PaymentsPage({ searchParams: search({ month: "2026-11" }) }));
    expect(html).not.toContain("All clear");
    expect(html).toContain("2 payments, 1 renewal");
    expect(html).toContain("Lapsed Traders");
    expect(html).toContain("Past due");
  });

  it("does not claim nothing is overdue when the plans could not be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listClients).mockRejectedValue(new Error("down"));
    const html = renderToStaticMarkup(await PaymentsPage({ searchParams: search({ month: "2026-11" }) }));
    expect(html).toContain("The plans could not be read");
    expect(html).not.toContain("No plan is past due or lapsed");
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

  it("shows the payment lapse policy summary", async () => {
    const html = renderToStaticMarkup(await PaymentsPage({ searchParams: search({ month: "2026-11" }) }));
    expect(html).toContain("Payment lapse policy");
    expect(html).toContain("7 days grace period");
    expect(html).toContain("14 days");
    expect(html).toContain("30 days");
  });
});
