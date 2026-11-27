import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCheckout } from "./loader";
import { billingDetailsMissing } from "./server/billing-details";
import { loadBusinessEntry, loadSavedServices } from "./server/entry";
import { recordFirstPaymentIfHeld } from "./server/first-payment-lookup";
import { loadMembershipCheckout, type MembershipCheckoutView } from "./server/membership-checkout";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("./server/billing-details", () => ({ billingDetailsMissing: vi.fn() }));
vi.mock("./server/entry", () => ({ loadBusinessEntry: vi.fn(), loadSavedServices: vi.fn() }));
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
    interval: "month",
    // No build fee owed, unless a test says otherwise: the figures these tests read are the services' alone.
    deal: { kind: "b2b", fee: null, note: null },
    locked: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
  vi.mocked(loadMembershipCheckout).mockResolvedValue(view());
  vi.mocked(loadSavedServices).mockResolvedValue([]);
  // Most tests below read the full checkout's figures, which a sign-up gets only when it still owes billing details. The
  // one-screen checkout a sign-up with its state saved gets has its own tests at the end.
  vi.mocked(billingDetailsMissing).mockResolvedValue(true);
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
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ services: ["managed-website"] }));
    const result = await loadCheckout(customer(), { services: "paid-ads" });
    // No list build fee for a client invited by staff, who has always had a free build (plan 65).
    expect(loadMembershipCheckout).toHaveBeenCalledWith(expect.anything(), "managed", ["managed-website"], expect.any(Date), "month", { chosenKind: "b2b", chargeListFee: false });
    expect(billingDetailsMissing).not.toHaveBeenCalled();
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

describe("loadCheckout for a sign-up account that has not paid", () => {
  beforeEach(() => {
    vi.mocked(billingDetailsMissing).mockResolvedValue(false);
    vi.mocked(loadMembershipCheckout).mockResolvedValue(
      view({ services: ["managed-website", "social-media"], firstMonth: { provider: "razorpay", hadService: { "social-media": false, "paid-ads": false } } }),
    );
  });

  it("shows the one-screen checkout and never sends the account to the questions, finished or not", async () => {
    const result = await loadCheckout(customer(), { services: "managed-website,social-media" });
    expect(result).toMatchObject({ kind: "signup-pay", services: ["managed-website", "social-media"], paymentFailed: false });
    // The questions come after payment: nothing here reads them or redirects.
    expect(redirect).not.toHaveBeenCalled();
  });

  it("prices the business's own currency, with the first-month offer it is owed", async () => {
    const result = await loadCheckout(customer(), {});
    if (result.kind !== "signup-pay") throw new Error("expected the one-screen checkout");
    expect(result.table.currency).toBe("INR");
    expect(result.table.services.find((service) => service.id === "social-media")).toMatchObject({ onOffer: true, firstMonthCents: 100 });

    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ plan: { ...PLAN, currency: "USD", taxRateBasisPoints: 0 } as never }));
    const dollars = await loadCheckout(customer(), {});
    if (dollars.kind !== "signup-pay") throw new Error("expected the one-screen checkout");
    expect(dollars.table).toMatchObject({ currency: "USD", taxRateBasisPoints: 0 });
  });

  it("gives no offer on a service the business has had", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ firstMonth: { provider: "razorpay", hadService: { "social-media": true, "paid-ads": false } } }));
    const result = await loadCheckout(customer(), {});
    if (result.kind !== "signup-pay") throw new Error("expected the one-screen checkout");
    expect(result.table.services.find((service) => service.id === "social-media")?.onOffer).toBe(false);
  });

  it("opens on the services the address names, else the basket the questions were last asked for, else none", async () => {
    vi.mocked(loadSavedServices).mockResolvedValue(["social-media"]);
    expect(await loadCheckout(customer(), { services: "managed-website" })).toMatchObject({ services: ["managed-website"] });
    expect(await loadCheckout(customer(), {})).toMatchObject({ services: ["social-media"] });
    vi.mocked(loadSavedServices).mockResolvedValue([]);
    expect(await loadCheckout(customer(), {})).toMatchObject({ services: [] });
  });

  it("says when it is back from a payment that did not go through", async () => {
    expect(await loadCheckout(customer(), { payment: "failed" })).toMatchObject({ kind: "signup-pay", paymentFailed: true });
  });

  it("keeps the full checkout for a business with a code applied, or one that still owes billing details", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ discount: { code: "SAVE20", stated: null, months: null } as never }));
    expect((await loadCheckout(customer(), {})).kind).toBe("pay");
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view());
    vi.mocked(billingDetailsMissing).mockResolvedValue(true);
    expect((await loadCheckout(customer(), {})).kind).toBe("pay");
  });

  it("still says a payment is waiting, under review or for the owner before showing Pay", async () => {
    const open = { id: "sub-1", status: "incomplete", activatedAt: null };
    expect(await loadCheckout(customer({ subscription: open }), { payment: "received" })).toEqual({ kind: "waiting", waitKey: "membership:sub-1" });
    expect(await loadCheckout(customer({ paymentUnderReview: true }), {})).toMatchObject({ kind: "under-review" });
  });
});

describe("loadCheckout with a website build fee (plan 65)", () => {
  const FEE = { kind: "ecommerce", fee: { listCents: 6_500_000, discountCents: 1_500_000, netCents: 5_000_000 }, note: "As agreed on call" } as const;

  it("asks a sign-up for the list fee, and reads the kind from the address", async () => {
    await loadCheckout(customer(), { site: "ecommerce", services: "managed-website" });
    expect(loadMembershipCheckout).toHaveBeenCalledWith(expect.anything(), "managed", ["managed-website"], expect.any(Date), "month", { chosenKind: "ecommerce", chargeListFee: true });
  });

  it("shows the build fee, its discount and the website's month left to the first monthly charge on the full checkout", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ services: ["managed-website"], deal: FEE }));
    const result = await loadCheckout(customer(), {});
    if (result.kind !== "pay") throw new Error("expected the pay view");
    expect(result.ledger.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Ecommerce store build", "₹65,000"],
      ["As agreed on call", "-₹15,000"],
      ["Maintenance", "Not charged today"],
    ]);
    expect(result.ledger.total).toBe("₹50,000");
    expect(result.ledger.renewal).toBe("Your payment covers the build. From one month after you pay, ₹3,999 (GST included) is taken each month for your service.");
    expect(result.about.steps.at(-1)).toEqual({ title: "Your store is live", note: "Within 21 days of the call" });
  });

  it("offers no way to change a deal a payment link decided, and hands the one-screen checkout its kind and discount", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ services: ["managed-website"], deal: FEE, locked: true, interval: "year" }));
    const full = await loadCheckout(customer(), {});
    if (full.kind !== "pay") throw new Error("expected the pay view");
    expect(full.ledger).toMatchObject({ locked: true, changeServicesHref: null });

    vi.mocked(billingDetailsMissing).mockResolvedValue(false);
    const one = await loadCheckout(customer(), {});
    if (one.kind !== "signup-pay") throw new Error("expected the one-screen checkout");
    expect(one).toMatchObject({ websiteKind: "ecommerce", services: ["managed-website"], link: { interval: "year", discountCents: 1_500_000, note: "As agreed on call" } });
  });
});
