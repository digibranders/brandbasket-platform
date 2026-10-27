import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { findCustomerPaymentMethod, findReactivation, findReactivationPlan, listCustomerReceipts } from "@/lib/server/billing";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import BillingPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn(), getCustomerBusinessKind: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({
  findCustomerPaymentMethod: vi.fn(),
  findReactivation: vi.fn(),
  findReactivationPlan: vi.fn(),
  listCustomerReceipts: vi.fn(),
}));
vi.mock("@/lib/server/charges", () => ({ listOpenCustomerCharges: vi.fn() }));
vi.mock("@/lib/server/billing-details", () => ({ loadBillingDetailsView: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getProjectOverview: vi.fn(async () => ({ project: null, completed: [] })) }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({ name: "Brandbasket", contactEmail: "support@brandbasket.in" })) }));
vi.mock("@/components/panel/email-us", () => ({ EmailUs: () => "support@brandbasket.in" }));
vi.mock("@/components/panel/billing/plan-summary", () => ({ PlanSummary: () => "[plan summary]", priceNote: () => "₹2,999 a month, GST included." }));
vi.mock("@/components/panel/billing/payment-method", () => ({ PaymentMethod: () => "[payment method]" }));
vi.mock("@/components/panel/billing/billing-details", () => ({ BillingDetails: () => "[billing details]" }));
vi.mock("@/components/panel/billing/payments-list", () => ({ PaymentsList: () => "[payments]" }));
vi.mock("@/components/panel/billing/reactivate-plan", () => ({ ReactivatePlan: () => "[reactivate]" }));
vi.mock("@/components/panel/billing/service-picker", () => ({ ServicePicker: () => "[service picker]" }));
vi.mock("@/components/panel/payment-waiting", () => ({ PaymentWaiting: () => "[waiting]" }));
vi.mock("@/lib/billing/billing-months", () => ({ billingMonths: vi.fn(() => []) }));
vi.mock("@brandbasket/shared/lib/billing/terms", () => ({ describePlanTerms: () => "₹2,999 a month, GST included.", monthlyPaymentAmount: () => "₹2,999" }));
vi.mock("./actions", () => ({ reactivateAction: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1" };
const paid = { status: "paid", hasAccess: true, hasWebsite: true, paymentUnderReview: false, renewalFailingUntil: null, plan: { name: "Services" }, subscription: { provider: "razorpay", cancelRequestedAt: null } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: paid } as never);
  vi.mocked(getCustomerBusinessKind).mockResolvedValue("website");
  vi.mocked(listCustomerReceipts).mockResolvedValue([]);
  vi.mocked(loadBillingDetailsView).mockResolvedValue(null);
  vi.mocked(listOpenCustomerCharges).mockResolvedValue([]);
  vi.mocked(findReactivationPlan).mockResolvedValue(null);
  vi.mocked(findReactivation).mockResolvedValue(null);
  vi.mocked(findCustomerPaymentMethod).mockResolvedValue(null);
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve(searchParams) })).replaceAll("<!-- -->", "");
}

describe("the Billing page", () => {
  it("puts the plan on the left and the payments in the aside, with no box around any section", async () => {
    const html = await render();
    expect(html).toContain(">Billing</h1>");
    expect(html).toContain("Your plan, and each month’s bill with its invoices and receipts.");
    expect(html.indexOf("[plan summary]")).toBeGreaterThan(-1);
    expect(html.indexOf("[payments]")).toBeGreaterThan(html.indexOf("[plan summary]"));
    expect(html).toMatch(/<aside[^>]*>[^<]*\[payments\]/);
    expect(html).not.toContain("rounded-card");
    expect(html).not.toContain("shadow-lift");
  });

  it("shows the payment method and billing details only when there are some", async () => {
    expect(await render()).not.toContain("[payment method]");
    vi.mocked(findCustomerPaymentMethod).mockResolvedValue({ kind: "initial", provider: "razorpay", method: "upi", upiVpa: null, cardNetwork: null, cardType: null, cardLast4: null, manualReference: null } as never);
    vi.mocked(loadBillingDetailsView).mockResolvedValue({ saved: null } as never);
    const html = await render();
    expect(html).toContain("[payment method]");
    expect(html).toContain("[billing details]");
  });

  it("says a payment is being confirmed, and the notice for a charge that was paid", async () => {
    expect(await render({ charge: "paid" })).toContain("Payment received.");
    vi.mocked(listOpenCustomerCharges).mockResolvedValue([{ kind: "add_on" }] as never);
    expect(await render({ charge: "processing" })).toContain("[waiting]");
  });

  it("tells a plan whose payments keep failing when the website would go offline", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { ...paid, renewalFailingUntil: new Date("2026-12-01T00:00:00Z") } } as never);
    const html = await render();
    expect(html).toContain("We couldn’t take your last payment");
    expect(html).toContain("To change it, email us at support@brandbasket.in.");
  });

  it("offers a lapsed plan's one way back, and no plan summary", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { ...paid, status: "lapsed", hasAccess: false } } as never);
    vi.mocked(findReactivationPlan).mockResolvedValue({ name: "Services", currency: "INR" } as never);
    vi.mocked(findReactivation).mockResolvedValue({ netCents: 299900, discountCents: 0, cancelled: false, services: [] } as never);
    const html = await render();
    expect(html).toContain("[reactivate]");
    expect(html).not.toContain("[plan summary]");
  });

  it("tells an account whose payment is under review that there is nothing more to pay", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { ...paid, status: "unpaid", hasAccess: false, paymentUnderReview: true } } as never);
    const html = await render();
    expect(html).toContain("There’s nothing more for you to pay.");
    expect(html).toContain("What happens next");
  });

  it("keeps the free listing account's own words", async () => {
    vi.mocked(getCustomerBusinessKind).mockResolvedValue("listing");
    expect(await render()).toContain("What you owe for ad spots you’ve won");
  });

  it("tells an unpaid account how paying works, with one dark link to the next step", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { ...paid, status: "unpaid", hasAccess: false, plan: null } } as never);
    const html = await render();
    expect(html).toContain("How paying works");
    expect(html).toContain("We can’t take payment in your currency just yet.");
    expect(html.match(/bg-ink/g)).toHaveLength(1);
  });
});
