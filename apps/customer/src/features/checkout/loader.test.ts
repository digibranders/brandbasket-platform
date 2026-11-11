import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadIntake } from "../start/server";
import { loadCheckout } from "./loader";
import { loadBusinessEntry } from "./server/entry";
import { loadMembershipCheckout, type MembershipCheckoutView } from "./server/membership-checkout";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("../start/server", () => ({ loadIntake: vi.fn() }));
vi.mock("./server/entry", () => ({ loadBusinessEntry: vi.fn() }));
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
  vi.mocked(loadMembershipCheckout).mockResolvedValue(view());
  vi.mocked(loadIntake).mockResolvedValue({ answers: {} as never, completedAt: new Date() });
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

  it("prices all three services with the package offer, GST inside and the ad money", async () => {
    const result = await loadCheckout(customer(), { services: "managed-website,social-media,paid-ads" });
    expect(result.kind).toBe("pay");
    if (result.kind !== "pay") return;
    expect(result.ledger.total).toBe("₹30,398");
    expect(result.ledger.gstLine).toBe("Includes ₹4,636.98 of GST at 18%");
    expect(result.ledger.adCredit).toBe("We add ₹3,000 a month to your ads");
    expect(result.ledger.changeServicesHref).toBe("/start?services=managed-website,social-media,paid-ads&q=summary");
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
    expect(loadMembershipCheckout).toHaveBeenCalledWith(expect.anything(), "managed", ["managed-website"], expect.any(Date));
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

  it("says when no plan is on sale", async () => {
    vi.mocked(loadMembershipCheckout).mockResolvedValue(view({ plan: null }));
    expect(await loadCheckout(customer(), {})).toEqual({ kind: "no-plan" });
  });
});
