import { type CreditNote, markPaymentRefunded, type Payment } from "@brandbasket/db";
import { executePaymentRefund } from "@brandbasket/shared/server/payment-refund";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { sendPaymentRefunded } from "@/lib/server/payment-emails";
import { requireStaffCan } from "@/lib/server/staff-role";
import type { GrantedStaff } from "@/lib/server/staff-access";
import { markPaymentRefundedAction, refundPaymentAction } from "./refund-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, markPaymentRefunded: vi.fn() };
});
vi.mock("@brandbasket/shared/server/payment-refund", () => ({
  executePaymentRefund: vi.fn(),
}));
vi.mock("@/lib/server/billing-provider", () => ({
  getBillingProvider: vi.fn(() => ({ name: "fake-or-rzp" })),
}));
vi.mock("@/lib/server/payment-emails", () => ({
  sendPaymentRefunded: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";
const PAYMENT = "01920000-0000-7000-8000-0000000000a1";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as unknown as GrantedStaff;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const GOOD = { businessId: BUSINESS, paymentId: PAYMENT, amount: "1,000", reason: "Charged twice", confirm: "yes" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStaffCan).mockResolvedValue(STAFF);
});

describe("markPaymentRefundedAction", () => {
  it("needs money access before anything else", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(new Error("redirect:/no-access"));
    await expect(markPaymentRefundedAction(form(GOOD))).rejects.toThrow("redirect:/no-access");
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(markPaymentRefunded).not.toHaveBeenCalled();
  });

  it("marks the payment, records who did it, and says so", async () => {
    vi.mocked(markPaymentRefunded).mockResolvedValue({ kind: "marked", cancelledEarnings: 1, paidEarnings: 0 });

    await expect(markPaymentRefundedAction(form(GOOD))).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing?refund=marked#payments`);

    expect(markPaymentRefunded).toHaveBeenCalledWith(
      { name: "staff-db" },
      { paymentId: PAYMENT, businessId: BUSINESS, refundedAmountCents: 100_000, reason: "Charged twice", staffUserId: "staff-1", now: expect.any(Date) },
    );
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, {
      businessId: BUSINESS,
      kind: "payment.marked_refunded",
      summary: "Marked a payment refunded",
      data: { paymentId: PAYMENT, refundedAmountCents: 100_000, reason: "Charged twice", cancelledEarnings: 1, paidEarnings: 0 },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}/billing`);
    expect(revalidatePath).toHaveBeenCalledWith("/payments");
  });

  it("warns when the affiliate was already paid for it", async () => {
    vi.mocked(markPaymentRefunded).mockResolvedValue({ kind: "marked", cancelledEarnings: 0, paidEarnings: 1 });
    await expect(markPaymentRefundedAction(form(GOOD))).rejects.toThrow("refund=marked-paid-earning");
  });

  it("sends a form problem back without touching the payment", async () => {
    await expect(markPaymentRefundedAction(form({ ...GOOD, confirm: "" }))).rejects.toThrow("refund=unconfirmed");
    expect(markPaymentRefunded).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("sends a refusal back and records nothing", async () => {
    vi.mocked(markPaymentRefunded).mockResolvedValue({ kind: "amount-too-high" });
    await expect(markPaymentRefundedAction(form(GOOD))).rejects.toThrow("refund=amount-too-high");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("refundPaymentAction", () => {
  it("needs money access before anything else", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(new Error("redirect:/no-access"));
    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow("redirect:/no-access");
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(executePaymentRefund).not.toHaveBeenCalled();
  });

  it("refunds via provider, marks DB, issues credit note, emails customer, and writes audit log", async () => {
    vi.mocked(executePaymentRefund).mockResolvedValue({
      kind: "refunded",
      payment: { id: PAYMENT, amountCents: 100_000 } as unknown as Payment,
      providerRefundId: "rfnd_fake_1",
      creditNote: { id: "cn-1", number: "CN/26-27/000001", refundedAmountCents: 100_000 } as unknown as CreditNote,
      cancelledEarnings: 1,
      paidEarnings: 0,
    });

    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing?refund=refunded#payments`);

    expect(executePaymentRefund).toHaveBeenCalledWith(
      { name: "staff-db" },
      { name: "fake-or-rzp" },
      {
        paymentId: PAYMENT,
        businessId: BUSINESS,
        refundedAmountCents: 100_000,
        reason: "Charged twice",
        staffUserId: "staff-1",
        now: expect.any(Date),
      },
    );
    expect(sendPaymentRefunded).toHaveBeenCalledWith({
      paymentId: PAYMENT,
      refundedAmountCents: 100_000,
      reason: "Charged twice",
      creditNoteNumber: "CN/26-27/000001",
    });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, {
      businessId: BUSINESS,
      kind: "payment.refunded",
      summary: "Refunded a payment via provider",
      data: {
        paymentId: PAYMENT,
        refundedAmountCents: 100_000,
        reason: "Charged twice",
        providerRefundId: "rfnd_fake_1",
        creditNoteNumber: "CN/26-27/000001",
        cancelledEarnings: 1,
        paidEarnings: 0,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}/billing`);
    expect(revalidatePath).toHaveBeenCalledWith("/payments");
  });

  it("warns when affiliate was already paid for it on refund", async () => {
    vi.mocked(executePaymentRefund).mockResolvedValue({
      kind: "refunded",
      payment: { id: PAYMENT, amountCents: 100_000 } as unknown as Payment,
      providerRefundId: "rfnd_fake_1",
      creditNote: { id: "cn-1", number: "CN/26-27/000001", refundedAmountCents: 100_000 } as unknown as CreditNote,
      cancelledEarnings: 0,
      paidEarnings: 1,
    });

    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow("refund=refunded-paid-earning");
  });

  it("handles provider failure: redirects to provider-failed, sends no email, writes no refund log", async () => {
    vi.mocked(executePaymentRefund).mockResolvedValue({
      kind: "provider-failed",
      error: "Gateway error",
    });

    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow("refund=provider-failed");
    expect(sendPaymentRefunded).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("handles already-refunded (double press): redirects to already-refunded without sending email", async () => {
    vi.mocked(executePaymentRefund).mockResolvedValue({
      kind: "already-refunded",
    });

    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow("refund=already-refunded");
    expect(sendPaymentRefunded).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("handles amount too high", async () => {
    vi.mocked(executePaymentRefund).mockResolvedValue({
      kind: "amount-too-high",
    });

    await expect(refundPaymentAction(form(GOOD))).rejects.toThrow("refund=amount-too-high");
    expect(sendPaymentRefunded).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});
