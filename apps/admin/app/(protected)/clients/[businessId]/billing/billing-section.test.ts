import {
  findActivePlan,
  findBillingProfile,
  findBillingState,
  listPaymentsForClient,
  listPaymentsNeedingAttention,
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
    listPaymentsWithoutTaxInvoice: vi.fn(),
    listTaxInvoicesForBusiness: vi.fn(),
  };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const CLIENT = { businessId: BUSINESS, businessName: "Om Sweets", currency: "INR", tier: "managed", billing: { subscription: null, firstPayment: null }, profile: null } as never;
const PACKAGE = {} as never;
const DENIED = new Error("redirect:/no-access");

const READS = [findActivePlan, findBillingProfile, findBillingState, listPaymentsForClient, listPaymentsNeedingAttention, listPaymentsWithoutTaxInvoice, listTaxInvoicesForBusiness, listClientCharges];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPaymentsForClient).mockResolvedValue([]);
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listPaymentsWithoutTaxInvoice).mockResolvedValue([]);
  vi.mocked(listTaxInvoicesForBusiness).mockResolvedValue([]);
  vi.mocked(listClientCharges).mockResolvedValue([]);
  vi.mocked(findActivePlan).mockResolvedValue(null);
  vi.mocked(findBillingProfile).mockResolvedValue(null);
  vi.mocked(findBillingState).mockResolvedValue(null);
});

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
});
