import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasAddedServiceAwaitingPayment, loadAddOnsPage } from "@/lib/server/add-ons";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import ServicesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/add-ons", () => ({ loadAddOnsPage: vi.fn(), hasAddedServiceAwaitingPayment: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ listOpenCustomerCharges: vi.fn() }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({ name: "Brandbasket", contactEmail: "support@brandbasket.in" })) }));
vi.mock("@/components/panel/add-ons/add-on-row", () => ({
  AddOnRow: ({ addOn, plansHeld }: { addOn: { id: string }; plansHeld: { held: number; total: number } | null }) =>
    `[row ${addOn.id}${plansHeld === null ? "" : ` ${plansHeld.held}/${plansHeld.total}`}]`,
}));
vi.mock("@/components/panel/add-ons/services-glance", () => ({
  ServicesGlance: ({ glance }: { glance: { next: { amount: string; on: string } | null } }) => `[glance ${glance.next === null ? "no payment" : `${glance.next.amount} ${glance.next.on}`}]`,
}));
vi.mock("@/components/v2/section-tabs", () => ({ SectionTabs: ({ label }: { label: string }) => `[tabs ${label}]` }));
vi.mock("@/components/panel/payment-waiting", () => ({ PaymentWaiting: () => "[waiting]" }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: { businessId: "business-1" }, billing: { subscription: null, plan: null } } as never);
  vi.mocked(listOpenCustomerCharges).mockResolvedValue([]);
  vi.mocked(hasAddedServiceAwaitingPayment).mockResolvedValue(false);
  vi.mocked(loadAddOnsPage).mockResolvedValue({
    addOns: [
      { addOn: "managed-website", kind: "included" },
      { addOn: "social-media", kind: "available" },
      { addOn: "paid-ads", kind: "available" },
    ],
  } as never);
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await ServicesPage({ searchParams: Promise.resolve(searchParams) })).replaceAll("<!-- -->", "");
}

describe("the Plan & billing page, Your services tab", () => {
  it("is titled Plan & billing, as the sidebar names it, with its tabs, and lists each service as a row", async () => {
    const html = await render();
    expect(html).toContain(">Plan &amp; billing</h1>");
    expect(html).toContain("[tabs Plan and billing]");
    expect(html).not.toContain(">Your plan</h1>");
    expect(html).not.toContain(">Services</h1>");
    for (const id of ["managed-website", "social-media", "paid-ads"]) expect(html).toContain(`[row ${id}]`);
    expect(html).toContain("@2xl:grid-cols-2");
    expect(html).not.toContain("divide-y divide-line");
  });

  it("shows the strip with the next payment above the tiles, and gives monitoring its count of plans", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({
      tenant: { businessId: "business-1" },
      billing: {
        subscription: {
          provider: "razorpay",
          cancelRequestedAt: null,
          commitmentEndsAt: null,
          paidThroughAt: new Date("2099-11-12T09:00:00.000Z"),
          bundledAddOnNetCents: 300_000,
          pendingBundledAddOnNetCents: null,
          discountAmountCents: 0,
          nextDiscountAmountCents: null,
        },
        plan: { recurringAmountCents: 100_000, currency: "INR" },
      },
    } as never);
    const html = await render();
    expect(html).toContain("[glance ₹4,000 12 November 2099]");
    expect(html.indexOf("[glance")).toBeLessThan(html.indexOf("[row managed-website"));
    expect(html).toContain("[row paid-ads 1/3]");
  });

  it("leaves the strip out when there is no plan to show it for", async () => {
    expect(await render()).not.toContain("[glance");
  });

  it("does not repeat the next payment in the header", async () => {
    expect(await render()).not.toMatch(/Next payment/);
  });

  it("sits in the page frame, left-aligned and as wide as the content area", async () => {
    const html = await render();
    expect(html).toContain("@container");
    expect(html).toContain("max-w-[97.5rem]");
    expect(html).not.toContain("mx-auto");
  });

  it("says a problem with a payment, and says nothing for one that went through", async () => {
    expect(await render({ charge: "failed" })).toContain("That payment didn’t go through");
    expect(await render({ charge: "paid" })).not.toContain("Payment received");
  });

  it("waits for a payment being confirmed instead of offering a second Add", async () => {
    vi.mocked(listOpenCustomerCharges).mockResolvedValue([{ kind: "add_on" }] as never);
    expect(await render({ charge: "processing" })).toContain("[waiting]");
  });

  it("waits on the way back from approving an added service until its payment is recorded", async () => {
    vi.mocked(hasAddedServiceAwaitingPayment).mockResolvedValue(true);
    expect(await render({ charge: "processing" })).toContain("[waiting]");
  });

  it("does not block Add for an added service that was opened but never paid", async () => {
    vi.mocked(hasAddedServiceAwaitingPayment).mockResolvedValue(true);
    expect(await render()).not.toContain("[waiting]");
  });
});
