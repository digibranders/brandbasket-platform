import type { BundledAddOn } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { listOpenCustomerCharges } from "../checkout/server/charges";
import { loadBillingOverview } from "./loader";
import { dropPreview } from "./rules";
import { loadAddOnsPage, type AddOnsPage } from "./server/add-ons";
import { findReactivation, findReactivationPlan } from "./server/billing";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("../checkout/server/billing", () => ({ listCustomerReceipts: vi.fn() }));
vi.mock("../checkout/server/billing-details", () => ({ loadBillingDetailsView: vi.fn() }));
vi.mock("../checkout/server/charges", () => ({ listOpenCustomerCharges: vi.fn() }));
vi.mock("./server/add-ons", () => ({ loadAddOnsPage: vi.fn() }));
vi.mock("./server/billing", () => ({ findCustomerPaymentMethod: vi.fn(), findReactivation: vi.fn(), findReactivationPlan: vi.fn() }));

const NOW = new Date("2026-11-03T06:00:00.000Z");
const NEXT = new Date("2026-11-27T06:00:00.000Z");
const PLAN = { recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800, name: "Brandbasket services plan" };
const SUBSCRIPTION = {
  provider: "razorpay",
  cancelRequestedAt: null,
  commitmentEndsAt: null,
  paidThroughAt: NEXT,
  bundledAddOnNetCents: 1_169_900,
  pendingBundledAddOnNetCents: null,
  discountAmountCents: 0,
  nextDiscountAmountCents: null,
  adCreditCents: 150_000,
};

function customerWith(role: "owner" | "editor", billing: Record<string, unknown> = {}): CustomerContext {
  return {
    role,
    tenant: { businessId: "b1", businessName: "Apex" },
    billing: { status: "paid", hasAccess: true, paymentUnderReview: false, renewalFailingUntil: null, subscription: SUBSCRIPTION, plan: PLAN, ...billing },
  } as unknown as CustomerContext;
}

const line = (addOn: string, list: number, discount: number) =>
  ({ addOn, status: "active", endRequestedAt: null, listAmountCents: list, offerDiscountAmountCents: discount, pendingOfferDiscountAmountCents: null, taxRateBasisPoints: 1_800, activatedAt: new Date("2026-08-27T06:00:00Z"), billedFrom: new Date("2026-08-27T06:00:00Z") }) as unknown as BundledAddOn;
const LINES = [line("managed-website", 299_900, 29_990), line("social-media", 999_900, 99_910)];
const price = (charged: number, list: number = charged) =>
  ({ currency: "INR", listCents: list, discountCents: list - charged, offerCents: list - charged, netCents: charged, taxRateBasisPoints: 1_800, chargedCents: charged }) as const;

const PAGE: AddOnsPage = {
  currency: "INR",
  lines: LINES,
  keptStartsOn: null,
  addOns: [
    { kind: "included", addOn: "managed-website", price: price(269_910, 299_900), endsOn: null, nextBillingOn: NEXT, joinsOn: null, keepable: false, drop: dropPreview({ staying: LINES, dropping: "managed-website", forfeited: false, currency: "INR" }) },
    { kind: "included", addOn: "social-media", price: price(899_990, 999_900), endsOn: null, nextBillingOn: NEXT, joinsOn: null, keepable: false, drop: dropPreview({ staying: LINES, dropping: "social-media", forfeited: false, currency: "INR" }) },
    { kind: "available", addOn: "paid-ads", price: price(1_999_920, 2_499_900), offer: { kind: "quote", chargeCents: 1_599_936, daysLeft: 24, nextRenewalCents: 3_039_800, renewsOn: NEXT } },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadAddOnsPage).mockResolvedValue(PAGE);
  vi.mocked(listOpenCustomerCharges).mockResolvedValue([]);
});

describe("loadBillingOverview", () => {
  it("gives the owner each service's action, the cancel dialog with the new total, and the bill with the next payment", async () => {
    const view = await loadBillingOverview(customerWith("owner"), {}, NOW);
    if (view.services === null || !view.services.ok) throw new Error("Expected services");
    const { rows, cancel, bill, headerLine, glance } = view.services.data;
    expect(glance).toEqual({ nextAmount: "₹11,699", nextOn: "Fri 27 Nov", plansHeld: 2, plansTotal: 3 });
    expect(rows.map((row) => [row.name, row.status.word, row.action.kind])).toEqual([
      ["Website Management", "Active", "cancel"],
      ["Social Media Management", "Active", "cancel"],
      ["Paid Ads Management", "Not added", "add"],
    ]);
    // Each service at its list price: the package discount shows once, in the bill.
    expect(rows.map((row) => row.price)).toEqual(["₹2,999", "₹9,999", "₹24,999"]);
    expect(rows[2]?.action).toEqual({
      kind: "add",
      summary: {
        title: "Add Paid Ads Management",
        rows: [{ key: "rest", label: "Paid Ads Management, 24 days left this month", amount: "₹15,999.36", tone: "plain" }],
        totalLabel: "Due today",
        total: "₹15,999.36",
        notes: ["Then ₹30,398 a month from Fri 27 Nov.", "All prices include GST."],
      },
    });
    expect(cancel?.options.find((option) => option.addOn === "social-media")?.copy.monthly).toBe("From Fri 27 Nov you pay ₹2,999 a month, GST included.");
    expect(bill?.total).toBe("₹11,699");
    expect(headerLine).toBe("Next payment ₹11,699 on Fri 27 Nov. All prices include 18% GST.");
  });

  it("shows a combined subscription's add as the service, the plan's extra days and the new monthly payment", async () => {
    const DEC_11 = new Date("2026-12-11T06:00:00.000Z");
    const combined = { kind: "combined", upfrontCents: 96_842, serviceCents: 100, extensionCents: 96_742, paidThroughAt: NEXT, newBillingDate: DEC_11, monthlyCents: 3_039_800, offer: true } as const;
    vi.mocked(loadAddOnsPage).mockResolvedValue({ ...PAGE, addOns: PAGE.addOns.map((entry) => (entry.kind === "available" ? { ...entry, offer: combined } : entry)) });
    const view = await loadBillingOverview(customerWith("owner"), {}, NOW);
    if (view.services === null || !view.services.ok) throw new Error("Expected services");
    expect(view.services.data.rows[2]?.action).toEqual({
      kind: "add",
      summary: {
        title: "Add Paid Ads Management",
        rows: [
          { key: "service", label: "Paid Ads Management, first month (Tue 3 Nov to Fri 11 Dec)", amount: "₹1", tone: "plain" },
          { key: "plan", label: "Current plan, 14 extra days", amount: "₹967.42", tone: "plain" },
        ],
        totalLabel: "Due today",
        total: "₹968.42",
        notes: [
          "All your services will now renew together on Fri 11 Dec. Your current plan is paid until Fri 27 Nov, so today also covers the days in between.",
          "From Fri 11 Dec, ₹30,398 a month for Website Management, Social Media Management and Paid Ads Management.",
          "All prices include GST.",
        ],
      },
    });
  });

  it("leaves out the extra days and their reason when the plan needs none", async () => {
    const DEC_11 = new Date("2026-12-11T06:00:00.000Z");
    const combined = { kind: "combined", upfrontCents: 100, serviceCents: 100, extensionCents: 0, paidThroughAt: DEC_11, newBillingDate: DEC_11, monthlyCents: 3_039_800, offer: true } as const;
    vi.mocked(loadAddOnsPage).mockResolvedValue({ ...PAGE, addOns: PAGE.addOns.map((entry) => (entry.kind === "available" ? { ...entry, offer: combined } : entry)) });
    const view = await loadBillingOverview(customerWith("owner"), {}, NOW);
    if (view.services === null || !view.services.ok) throw new Error("Expected services");
    const action = view.services.data.rows[2]?.action;
    if (action?.kind !== "add") throw new Error("Expected an add");
    expect(action.summary.rows.map((row) => row.key)).toEqual(["service"]);
    expect(action.summary.notes).toEqual(["From Fri 11 Dec, ₹30,398 a month for Website Management, Social Media Management and Paid Ads Management.", "All prices include GST."]);
  });

  it("gives an editor the same figures and no action", async () => {
    const view = await loadBillingOverview(customerWith("editor"), {}, NOW);
    if (view.services === null || !view.services.ok) throw new Error("Expected services");
    expect(view.canManage).toBe(false);
    expect(view.services.data.rows.every((row) => row.action.kind === "none")).toBe(true);
    expect(view.services.data.cancel).toBeNull();
    expect(view.services.data.bill?.total).toBe("₹11,699");
  });

  it("offers no second add while a charge payment is still being confirmed", async () => {
    vi.mocked(listOpenCustomerCharges).mockResolvedValue([{ id: "c1" }] as never);
    const view = await loadBillingOverview(customerWith("owner"), { charge: "processing" }, NOW);
    if (view.services === null || !view.services.ok || !view.notices.ok) throw new Error("Expected services");
    expect(view.notices.data.chargeWaiting).toBe(true);
    expect(view.services.data.rows[2]?.action.kind).toBe("none");
  });

  it("reads the service ?add= names", async () => {
    expect((await loadBillingOverview(customerWith("owner"), { add: "social" }, NOW)).preselect).toBe("social-media");
    expect((await loadBillingOverview(customerWith("owner"), { add: "search" }, NOW)).preselect).toBeNull();
  });

  it("loads no services for an unpaid business, and the reactivation for a lapsed one", async () => {
    const unpaid = await loadBillingOverview(customerWith("owner", { status: "unpaid", hasAccess: false }), {}, NOW);
    expect(unpaid.state.kind).toBe("unpaid");
    expect(unpaid.services).toBeNull();
    expect(loadAddOnsPage).not.toHaveBeenCalled();

    vi.mocked(findReactivationPlan).mockResolvedValue(PLAN as never);
    vi.mocked(findReactivation).mockResolvedValue({ cancelled: false, services: ["managed-website"], lines: [{ addOn: "managed-website", title: "Website Management", listCents: 299_900, offerCents: 0, netCents: 299_900 }], netCents: 299_900, discountCents: 0, billingInterval: "month" });
    const lapsed = await loadBillingOverview(customerWith("owner", { status: "lapsed", hasAccess: false }), {}, NOW);
    expect(lapsed.services).toBeNull();
    expect(lapsed.reactivation).toEqual({
      ok: true,
      data: {
        planName: expect.any(String),
        monthlyAmount: "₹2,999",
        per: "a month",
        chosen: null,
        picker: null,
        summary: {
          title: "Reactivate your plan",
          rows: [{ key: "managed-website", label: "Website Management", amount: "₹2,999", tone: "plain" }],
          totalLabel: "Due today",
          total: "₹2,999",
          notes: [expect.stringMatching(/^It renews a month from /), "All prices include GST."],
        },
      },
    });
  });

  it("prices a reactivation less the kept code through the shared renewal figure, and refuses one that leaves nothing", async () => {
    const lapsedOwner = customerWith("owner", { status: "lapsed", hasAccess: false });
    vi.mocked(findReactivationPlan).mockResolvedValue(PLAN as never);
    vi.mocked(findReactivation).mockResolvedValue({ cancelled: false, services: ["managed-website"], lines: [{ addOn: "managed-website", title: "Website Management", listCents: 299_900, offerCents: 0, netCents: 299_900 }], netCents: 299_900, discountCents: 30_000, billingInterval: "month" });
    expect((await loadBillingOverview(lapsedOwner, {}, NOW)).reactivation).toMatchObject({
      ok: true,
      data: { monthlyAmount: "₹2,699", summary: { rows: [{ label: "Website Management" }, { label: "Your code", amount: "-₹300", tone: "save" }], total: "₹2,699" } },
    });
    vi.mocked(findReactivation).mockResolvedValue({ cancelled: false, services: ["managed-website"], lines: [{ addOn: "managed-website", title: "Website Management", listCents: 299_900, offerCents: 0, netCents: 299_900 }], netCents: 299_900, discountCents: 299_900, billingInterval: "month" });
    expect((await loadBillingOverview(lapsedOwner, {}, NOW)).reactivation).toMatchObject({ ok: false });
  });

  it("returns the panel's failure, never an empty list, when the services cannot be read", async () => {
    vi.mocked(loadAddOnsPage).mockRejectedValue(new Error("db down"));
    const view = await loadBillingOverview(customerWith("owner"), {}, NOW);
    expect(view.services).toMatchObject({ ok: false });
  });
});
