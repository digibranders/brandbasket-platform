import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadIntake } from "../start/server";
import { loadCheckout } from "./loader";
import { loadBusinessEntry } from "./server/entry";
import { recordFirstPaymentIfHeld } from "./server/first-payment-lookup";
import { loadMembershipCheckout, type MembershipCheckoutView } from "./server/membership-checkout";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("../start/server", () => ({ loadIntake: vi.fn() }));
vi.mock("./server/entry", () => ({ loadBusinessEntry: vi.fn() }));
vi.mock("./server/first-payment-lookup", () => ({ recordFirstPaymentIfHeld: vi.fn() }));
vi.mock("./server/membership-checkout", () => ({ loadMembershipCheckout: vi.fn() }));

const PLAN = { initialAmountCents: 0, recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800, initialTermMonths: 1 };

function customer(billing: Record<string, unknown> = {}) {
  return { role: "owner", tenant: { businessId: "biz-1" }, billing: { status: "unpaid", subscription: null, paymentUnderReview: false, ...billing } } as never;
}

function view(overrides: Partial<MembershipCheckoutView> = {}): MembershipCheckoutView {
  return {
    plan: PLAN as never,
    services: ["managed-website", "social-media", "paid-ads"],
    discount: null,
    lapsedCode: null,
    forfeited: false,
    hasEverPaid: false,
    billingDetails: null,
    offer: { kind: "available" },
    // A business that has had both offer plans, unless a test says otherwise: every plan at its price.
    firstMonth: { provider: "razorpay", hadService: { "social-media": true, "paid-ads": true } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
  vi.mocked(loadMembershipCheckout).mockResolvedValue(view());
  vi.mocked(loadIntake).mockResolvedValue({ answers: {} as never, completedAt: new Date() });
  vi.mocked(recordFirstPaymentIfHeld).mockResolvedValue(false);
});

describe("loadCheckout", () => {
  it("sends a business that has paid Home, with the welcome when this payment opened its plan", async () => {
    await expect(loadCheckout(customer({ status: "paid" }), {})).rejects.toThrow("redirect:/");
    await expect(loadCheckout(customer({ status: "paid" }), { payment: "received" })).rejects.toThrow("redirect:/?welcome=1");
  });

  it("sends a lapsed business to Plan & billing to reactivate", async () => {
    await expect(loadCheckout(customer({ status: "lapsed" }), {})).rejects.toThrow("redirect:/billing");
  });

  it("shows a member who is not the owner that paying is the owner's, without reading the checkout", async () => {
    for (const role of ["editor", "viewer"]) {
      const member = { ...(customer() as object), role } as never;
      expect(await loadCheckout(member, {})).toEqual({ kind: "owner-only" });
    }
    expect(loadMembershipCheckout).not.toHaveBeenCalled();
  });

  it("asks a new account the questions first", async () => {
    vi.mocked(loadIntake).mockResolvedValue({ answers: {} as never, completedAt: null });
    await expect(loadCheckout(customer(), { services: "managed-website,social-media,paid-ads" })).rejects.toThrow(
      "redirect:/start?services=managed-website,social-media,paid-ads",
    );
  });

  it("prices all three services at list, GST inside and no ad money", async () => {
    const result = await loadCheckout(customer(), { services: "managed-website,social-media,paid-ads" });
    expect(result.kind).toBe("pay");
    if (result.kind !== "pay") return;
    expect(result.ledger.total).toBe("₹8,997");
    expect(result.ledger.gstLine).toBe("Includes ₹1,372.42 of GST at 18%");
    expect(result.ledger.adCredit).toBeNull();
    expect(result.ledger.changeServicesHref).toBe("/start?services=managed-website,social-media,paid-ads&q=summary");
  });

  it("charges ₹1 for the first month of a plan the business never had, and says what is due today: ₹3,000 for the website and Social Media", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(
      view({ services: ["managed-website", "social-media"], firstMonth: { provider: "razorpay", hadService: { "social-media": false, "paid-ads": false } } }),
    );
    const result = await loadCheckout(customer(), { services: "managed-website,social-media" });
    if (result.kind !== "pay") throw new Error("expected the pay view");
    expect(result.ledger.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Website", "Free"],
      ["Maintenance", "₹2,999"],
      ["Social Media Management, first month", "₹1"],
    ]);
    expect(result.ledger.total).toBe("₹3,000");
    expect(result.ledger.gstLine).toBe("Includes ₹457.62 of GST at 18%");
    expect(result.ledger.renewal).toBe("Your first payment covers your first month, then ₹5,998 (GST included) is taken each month for your services.");
  });

  it("names no GST for a dollar plan", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ plan: { ...PLAN, currency: "USD", taxRateBasisPoints: 0 } as never }));
    const result = await loadCheckout(customer(), {});
    if (result.kind !== "pay") throw new Error("expected the pay view");
    expect(result.ledger.gstLine).toBeNull();
    expect(result.lead).not.toContain("GST");
  });

  it("charges a website client invited by staff for the website alone, with no questions to answer", async () => {
    vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
    vi.mocked(loadIntake).mockResolvedValue({ answers: {} as never, completedAt: null });
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ services: ["managed-website"] }));
    const result = await loadCheckout(customer(), { services: "paid-ads" });
    expect(loadMembershipCheckout).toHaveBeenCalledWith(expect.anything(), "managed", ["managed-website"], expect.any(Date), "month");
    if (result.kind !== "pay") throw new Error("expected the pay view");
    expect(result.ledger.changeServicesHref).toBeNull();
  });

  it("says a payment is under review instead of asking for another", async () => {
    expect(await loadCheckout(customer({ paymentUnderReview: true }), { payment: "received" })).toMatchObject({ kind: "under-review" });
  });

  it("waits for a payment just made while its checkout has not settled, and only then", async () => {
    const open = { id: "sub-1", status: "incomplete", activatedAt: null };
    expect(await loadCheckout(customer({ subscription: open }), { payment: "received" })).toEqual({ kind: "waiting", waitKey: "membership:sub-1" });
    expect((await loadCheckout(customer(), { payment: "received" })).kind).toBe("pay");
  });

  it("moves a customer on at once when the provider already holds the payment its webhook has not delivered", async () => {
    vi.mocked(recordFirstPaymentIfHeld).mockResolvedValue(true);
    const open = { id: "sub-1", status: "incomplete", activatedAt: null };
    await expect(loadCheckout(customer({ subscription: open }), { payment: "received" })).rejects.toThrow("redirect:/?welcome=1");
    expect(recordFirstPaymentIfHeld).toHaveBeenCalledWith(open);
  });

  it("says when no plan is on sale", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ plan: null }));
    expect(await loadCheckout(customer(), {})).toEqual({ kind: "no-plan" });
  });
});
