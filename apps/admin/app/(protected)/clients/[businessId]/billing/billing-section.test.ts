import {
  findActivePlan,
  findBillingProfile,
  findBillingState,
  listPaymentsForClient,
  listPaymentsNeedingAttention,
  listPriceOverridesForBusiness,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
} from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listClientCharges } from "@/lib/server/charges-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { BillingSection } from "./billing-section";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/charges-admin", () => ({ listClientCharges: vi.fn() }));
vi.mock("@/lib/server/billing-admin", () => ({ loadManualCarriedCode: vi.fn() }));
vi.mock("@brandbasket/shared/server/reactivation-basket", () => ({ loadReactivationBasket: vi.fn() }));
vi.mock("@/lib/server/client-billing-details", () => ({ clientBillingDetails: () => ({}) }));
vi.mock("../actions", () => ({ resolvePaymentAttentionAction: vi.fn() }));
vi.mock("./override-actions", () => ({ clearPriceOverrideAction: vi.fn() }));
vi.mock("./refund-actions", () => ({ markPaymentRefundedAction: vi.fn(), refundPaymentAction: vi.fn() }));
vi.mock("../parts", () => ({ BillingFacts: () => "[billing facts]", ManualPaymentForm: () => "[manual payment]" }));
vi.mock("@/components/client-charges", () => ({ ClientCharges: () => "[charges]" }));
vi.mock("@/components/client-invoicing", () => ({ ClientBillingDetails: () => "[billing details]", ClientTaxInvoices: () => "[tax invoices]" }));
vi.mock("@/components/client-payments", () => ({ ClientPayments: () => "[payments]" }));
vi.mock("@/components/payments-needing-attention", () => ({ PaymentsNeedingAttention: () => "[attention]" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findActivePlan: vi.fn(),
    findBillingProfile: vi.fn(),
    findBillingState: vi.fn(),
    listPaymentsForClient: vi.fn(),
    listPaymentsNeedingAttention: vi.fn(),
    listPriceOverridesForBusiness: vi.fn(),
    listPaymentsWithoutTaxInvoice: vi.fn(),
    listTaxInvoicesForBusiness: vi.fn(),
  };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const CLIENT_FIELDS = { businessId: BUSINESS, businessName: "Om Sweets", currency: "INR", tier: "managed", billing: { subscription: null, firstPayment: null }, profile: null };
const CLIENT = CLIENT_FIELDS as never;
const PACKAGE = {} as never;
const DENIED = new Error("redirect:/no-access");

const READS = [findActivePlan, findBillingProfile, findBillingState, listPaymentsForClient, listPaymentsNeedingAttention, listPaymentsWithoutTaxInvoice, listTaxInvoicesForBusiness, listPriceOverridesForBusiness, listClientCharges];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPaymentsForClient).mockResolvedValue([]);
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listPaymentsWithoutTaxInvoice).mockResolvedValue([]);
  vi.mocked(listTaxInvoicesForBusiness).mockResolvedValue([]);
  vi.mocked(listPriceOverridesForBusiness).mockResolvedValue([]);
  vi.mocked(listClientCharges).mockResolvedValue([]);
  vi.mocked(findActivePlan).mockResolvedValue(null);
  vi.mocked(findBillingProfile).mockResolvedValue(null);
  vi.mocked(findBillingState).mockResolvedValue(null);
});

const STATE = (hasEverPaid: boolean, subscription: object | null = null) => ({ hasEverPaid, subscription, plan: null }) as never;
const FEE = { websiteKind: "ecommerce", setupFeeListCents: 6_500_000, setupFeeDiscountCents: 1_500_000, setupFeeNote: "Agreed on call", paymentLinkId: "link-1" };

describe("the billing section of Plan and billing", () => {
  it("is refused for a role without money, before a single payment, invoice or charge is read", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(DENIED);
    await expect(BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE })).rejects.toBe(DENIED);
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    for (const read of READS) expect(read).not.toHaveBeenCalled();
  });

  it("reads and shows payments, billing, invoices and charges for a role with money", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    const html = renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }));
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    for (const marker of ["[payments]", "[billing facts]", "[billing details]", "[tax invoices]", "[charges]"]) expect(html).toContain(marker);
    expect(listPaymentsForClient).toHaveBeenCalledOnce();
    expect(listClientCharges).toHaveBeenCalledOnce();
  });

  it("offers a payment link to a business that never paid, and not to one that did", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    vi.mocked(findBillingState).mockResolvedValue(STATE(false));
    expect(renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }))).toContain(`href="/payment-links/new?business=${BUSINESS}"`);
    vi.mocked(findBillingState).mockResolvedValue(STATE(true));
    expect(renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }))).not.toContain("/payment-links/new");
  });

  it("shows the build fee, its discount and note and the link it came from, from the frozen columns", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    vi.mocked(findBillingState).mockResolvedValue(STATE(true, FEE));
    const html = renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }));
    for (const text of ["Website build", "Ecommerce store", "₹65,000", "₹15,000", "₹50,000", "Agreed on call", "A staff payment link"]) expect(html).toContain(text);
  });

  it("shows no build fee section when none was owed", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    vi.mocked(findBillingState).mockResolvedValue(STATE(true, { ...FEE, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null }));
    expect(renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }))).not.toContain("Website build");
  });

  const DEAL = { linkId: "link-9", state: "building", currency: "INR", advanceCents: 2_000_000, advancePaidAt: new Date("2026-11-17T09:00:00.000Z"), balanceCents: 4_000_000 };

  it("links to Edit deal while the deal is being built, and not once its balance is due (staff undo ready first)", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    const building = { ...CLIENT_FIELDS, billing: { subscription: null, firstPayment: null, deal: DEAL } } as never;
    expect(renderToStaticMarkup(await BillingSection({ client: building, query: {}, packageFacts: PACKAGE }))).toContain('href="/payment-links/link-9/edit"');
    const ready = { ...CLIENT_FIELDS, billing: { subscription: null, firstPayment: null, deal: { ...DEAL, state: "balance_due" } } } as never;
    expect(renderToStaticMarkup(await BillingSection({ client: ready, query: {}, packageFacts: PACKAGE }))).not.toContain("/edit");
  });

  it("lists each agreed price with a Remove button, and nothing when there are none", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue({} as never);
    expect(renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }))).not.toContain("Agreed price");
    vi.mocked(listPriceOverridesForBusiness).mockResolvedValue([
      { addOn: "social-media", billingInterval: "month", netCents: 199_900 },
      { addOn: "managed-website", billingInterval: "year", netCents: 2_999_000 },
    ] as never);
    const html = renderToStaticMarkup(await BillingSection({ client: CLIENT, query: {}, packageFacts: PACKAGE }));
    expect(html).toContain("Agreed prices");
    expect(html).toContain("Social Media Management ₹1,999 a month");
    expect(html).toContain("Website Management ₹29,990 a year");
    expect(html.match(/Remove/g)).toHaveLength(2);
  });
});
