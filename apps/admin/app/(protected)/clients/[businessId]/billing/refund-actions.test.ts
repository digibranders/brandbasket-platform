import { markPaymentRefunded } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffCan } from "@/lib/server/staff-role";
import type { GrantedStaff } from "@/lib/server/staff-access";
import { markPaymentRefundedAction } from "./refund-actions";

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
