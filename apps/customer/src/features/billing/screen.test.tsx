import { cleanup, render, screen, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ToastProvider } from "@/ui";
import { BillingScreen, InvoicesScreen, PaymentScreen } from "./components/billing-screens";
import { loadBillingOverview, loadInvoices, loadPaymentPage, type BillingOverview, type ServicesPanelView } from "./loader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/billing",
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadBillingOverview: vi.fn(), loadInvoices: vi.fn(), loadPaymentPage: vi.fn() }));
vi.mock("./actions", () => ({ addServiceAction: vi.fn(), cancelServiceAction: vi.fn(), reactivateAction: vi.fn(), saveBillingDetailsAction: vi.fn() }));
vi.mock("../checkout/actions", () => ({ payChargeAction: vi.fn(), lookupPincodeAction: vi.fn() }));
vi.mock("../requests/actions", () => ({ sendRequestAction: vi.fn() }));

const customer = { businessName: "Apex Diagnostics", businessId: "b1", tenant: {}, role: "owner", billing: { status: "paid" } } as unknown as CustomerContext;
const FAILURE = { ok: false, error: { at: new Date("2026-11-03T06:00:00Z") } } as const;
const wrap = (node: ReactNode) =>
  render(
    <NuqsTestingAdapter>
      <ToastProvider>{node}</ToastProvider>
    </NuqsTestingAdapter>,
  );

const SERVICES: ServicesPanelView = {
  rows: [
    { addOn: "managed-website", service: "website", name: "Website Management", status: { word: "Active", tone: "pos" }, price: "₹2,399", line: "Since Thu 27 Aug.", action: { kind: "cancel" } },
    { addOn: "social-media", service: "social", name: "Social & Ads", status: { word: "Active", tone: "pos" }, price: "₹7,999", line: "Since Thu 27 Aug.", action: { kind: "cancel" } },
    { addOn: "paid-ads", service: "search", name: "Local SEO + AEO", status: { word: "Not added", tone: "neutral" }, price: "₹22,499", line: "Local search.", action: { kind: "add", quote: "₹18,000 today for the 24 days left this month, then ₹30,398 a month from Fri 27 Nov, GST included." } },
  ],
  cancel: {
    endsOn: "Fri 27 Nov",
    options: [{ addOn: "social-media", name: "Social & Ads", copy: { keeps: "You keep Website Management.", monthly: "From Fri 27 Nov you pay ₹2,999 a month, GST included.", websiteOffline: null, packageEnds: null } }],
  },
  bill: { period: "month", rows: [{ label: "List price, 2 services", amount: "₹12,998", discount: false }, { label: "Package discount, 10%", amount: "−₹1,299", discount: true }], totalCents: 1_169_900, total: "₹11,699", gstLine: "Includes ₹1,784.59 GST.", adMoneyLine: null },
  headerLine: "Next payment ₹11,699 on Fri 27 Nov. All prices include 18% GST.",
};

const NOTICES = { ok: true, data: { charge: null, chargeWaiting: false, paymentReturn: "none" } } as const;

function overview(overrides: Partial<BillingOverview>): BillingOverview {
  return { state: { kind: "paid" }, canManage: true, preselect: null, notices: NOTICES, services: { ok: true, data: SERVICES }, reactivation: null, ...overrides };
}

beforeEach(() => vi.resetAllMocks());

describe("Plan & billing, Your services", () => {
  it("shows the services, the bill from the shared figures and the next payment, with Add and Cancel for the owner", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({}));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByText(SERVICES.headerLine ?? "")).toBeTruthy();
    expect(screen.getByText("₹11,699")).toBeTruthy();
    expect(screen.getByText("Includes ₹1,784.59 GST.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel a service" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Refer a business" })).toBeNull();
  });

  it("opens the add straight away for the service ?add= names, with what it costs", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ preselect: "paid-ads" }));
    wrap(await BillingScreen({ customer, params: { add: "search" } }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/₹18,000 today for the 24 days left/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Add and pay" })).toBeTruthy();
  });

  it("is read only for an editor or viewer", async () => {
    const readOnly = { ...SERVICES, rows: SERVICES.rows.map((row) => ({ ...row, action: { kind: "none" as const } })), cancel: null };
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ canManage: false, services: { ok: true, data: readOnly } }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByText("Social & Ads")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel a service" })).toBeNull();
  });

  it("shows the error state, never an empty plan, when the services fail to load", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ services: FAILURE }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your services.");
    expect(screen.queryByText("This month's bill")).toBeNull();
  });
});

describe("each plan state has its one action", () => {
  it("renewal failing: change the payment method", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "renewal-failing", until: new Date("2026-11-27T06:00:00Z") } }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByText("We couldn’t take your last payment")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change payment method" }).getAttribute("href")).toBe("/billing/payment");
  });

  it("under review: nothing more to pay, and no button", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "under-review" }, services: null }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByText(/There’s nothing more for you to pay/)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("unpaid: go to checkout", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "unpaid" }, services: null }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("link", { name: "Go to checkout" }).getAttribute("href")).toBe("/checkout");
  });

  it("lapsed: reactivate for the month's price, through the checkout's reactivation", async () => {
    const reactivation = { ok: true, data: { planName: "Brandbasket services plan", monthlyAmount: "₹11,699", per: "a month", chosen: null, picker: null } } as const;
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "lapsed" }, services: null, reactivation }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("button", { name: "Reactivate for ₹11,699" })).toBeTruthy();
  });

  it("lapsed with the plan unreadable: the error state", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "lapsed" }, services: null, reactivation: FAILURE }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your plan.");
  });
});

describe("Invoices", () => {
  const paid = { kind: "payment", id: "p1", number: "FY/26-27/000041", date: new Date("2026-10-27T06:00:00Z"), amountCents: 3_039_800, amount: "₹30,398", status: "Paid", tone: "pos", downloadable: true } as const;

  it("lists each invoice with its PDF through the receipts route", async () => {
    vi.mocked(loadInvoices).mockResolvedValue({ invoices: [{ row: paid, lines: [{ label: "Website Management", amount: "INR 2,999.00" }], total: "INR 30,398.00" }], billedTo: null, canDownload: true });
    wrap(await InvoicesScreen({ customer }));
    expect(screen.getByText("FY/26-27/000041")).toBeTruthy();
    expect(screen.getByRole("link", { name: "PDF" }).getAttribute("href")).toBe("/billing/receipts?ids=p1");
  });

  it("offers no download to someone who is not the owner", async () => {
    vi.mocked(loadInvoices).mockResolvedValue({ invoices: [{ row: paid, lines: [], total: "INR 30,398.00" }], billedTo: null, canDownload: false });
    wrap(await InvoicesScreen({ customer }));
    expect(screen.queryByRole("link", { name: "PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download all" })).toBeNull();
  });

  it("offers Pay on an open charge to the owner only (payChargeAction is owner only)", async () => {
    const due = { kind: "due", id: "c1", number: "Extra blog posts", date: new Date("2026-10-27T06:00:00Z"), amountCents: 99_900, amount: "₹999", status: "To pay", tone: "warn" } as const;
    vi.mocked(loadInvoices).mockResolvedValue({ invoices: [{ row: due, lines: [], total: "₹999" }], billedTo: null, canDownload: false });
    wrap(await InvoicesScreen({ customer }));
    expect(screen.getByRole("button", { name: "Pay" })).toBeTruthy();
    cleanup();
    wrap(await InvoicesScreen({ customer: { ...customer, role: "editor" } }));
    expect(screen.queryByRole("button", { name: "Pay" })).toBeNull();
  });

  it("shows the error state when the invoices fail to load", async () => {
    vi.mocked(loadInvoices).mockRejectedValue(new Error("down"));
    wrap(await InvoicesScreen({ customer }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your invoices.");
  });
});

describe("Payment and details", () => {
  it("shows the card and a Change that asks the team (gate G7), not a Razorpay mandate change", async () => {
    vi.mocked(loadPaymentPage).mockResolvedValue({ method: { ok: true, data: { method: { kind: "renews", label: "Visa credit card ending 4242" }, renewsOn: "Fri 27 Nov" } }, details: { ok: true, data: null }, canManage: true });
    wrap(await PaymentScreen({ customer }));
    expect(screen.getByText("Visa credit card ending 4242")).toBeTruthy();
    expect(screen.getByText("Renews automatically on Fri 27 Nov through Razorpay.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.queryByText("Billing details")).toBeNull();
  });

  it("shows each panel's error state on its own", async () => {
    vi.mocked(loadPaymentPage).mockResolvedValue({ method: FAILURE, details: FAILURE, canManage: true });
    wrap(await PaymentScreen({ customer }));
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts.some((text) => text?.includes("We could not load your payment method."))).toBe(true);
    expect(alerts.some((text) => text?.includes("We could not load your billing details."))).toBe(true);
  });
});
