import { render, screen } from "@testing-library/react";
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

const NOW = new Date("2026-11-03T06:00:00Z");
const NOISE = /No data|undefined|\bnull\b|NaN/;
const FAILED = { ok: false, error: { at: NOW } } as const;
const customer = { businessName: "Apex Diagnostics", businessId: "b1", tenant: {}, role: "owner", billing: { status: "paid" } } as unknown as CustomerContext;
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter><ToastProvider>{node}</ToastProvider></NuqsTestingAdapter>);

const SERVICES: ServicesPanelView = {
  rows: [{ addOn: "managed-website", service: "website", name: "Managed Website", status: { word: "Active", tone: "pos" }, price: "₹2,999", line: "Since Thu 27 Aug.", action: { kind: "none" } }],
  cancel: null,
  bill: { period: "month", rows: [{ label: "Managed Website", amount: "₹2,999", discount: false }], totalCents: 299_900, total: "₹2,999", gstLine: null, adMoneyLine: null },
  headerLine: null,
};
const NOTICES = { ok: true, data: { charge: null, chargeWaiting: false, paymentReturn: "none" } } as const;
const overview = (over: Partial<BillingOverview> = {}): BillingOverview => ({ state: { kind: "paid" }, canManage: true, preselect: null, notices: NOTICES, services: { ok: true, data: SERVICES }, reactivation: null, ...over });

beforeEach(() => vi.resetAllMocks());

describe("Plan & billing: one failed panel", () => {
  it("failed services show their own error and the page header, without the bill", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ services: FAILED }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your services.");
    expect(screen.getByRole("heading", { name: "Your services" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Plan & billing", level: 1 })).toBeTruthy();
    expect(screen.queryByText("This month's bill")).toBeNull();
  });

  it("failed notices say so and the services still draw", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ notices: FAILED }));
    wrap(await BillingScreen({ customer, params: { payment: "failed" } }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load the result of your payment.");
    expect(screen.getAllByText("Managed Website").length).toBeGreaterThan(0);
  });

  it("a lapsed plan whose details cannot be read says so instead of offering a blank reactivation", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "lapsed" }, services: null, reactivation: FAILED }));
    wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your plan.");
    expect(screen.getByRole("heading", { name: "Your plan has ended" })).toBeTruthy();
  });

  it("a lapsed plan with no details found asks the team rather than showing nothing", async () => {
    vi.mocked(loadBillingOverview).mockResolvedValue(overview({ state: { kind: "lapsed" }, services: null, reactivation: { ok: true, data: null } }));
    const { container } = wrap(await BillingScreen({ customer, params: {} }));
    expect(screen.getByText(/We couldn’t find your plan’s details/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Invoices states", () => {
  it("a failed read shows its own error under the tabs", async () => {
    vi.mocked(loadInvoices).mockRejectedValue(new Error("down"));
    wrap(await InvoicesScreen({ customer }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your invoices.");
    expect(screen.getByRole("heading", { name: "Invoices" })).toBeTruthy();
    expect(screen.queryByText("No invoices yet")).toBeNull();
  });

  it("no invoices says what will appear", async () => {
    vi.mocked(loadInvoices).mockResolvedValue({ invoices: [], billedTo: null, canDownload: true });
    const { container } = wrap(await InvoicesScreen({ customer }));
    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.getByText("Each payment's invoice or receipt shows here.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Payment states", () => {
  const method = { ok: true, data: { method: { kind: "renews", label: "Visa credit card ending 4242" }, renewsOn: null } } as const;

  it.each([
    { name: "method", what: "your payment method", page: { method: FAILED, details: { ok: true, data: null }, canManage: true } },
    { name: "details", what: "your billing details", page: { method, details: FAILED, canManage: true } },
  ] as const)("$name failed shows its own error and the other panel stays", async ({ what, page }) => {
    vi.mocked(loadPaymentPage).mockResolvedValue(page);
    wrap(await PaymentScreen({ customer }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain(`We could not load ${what}.`);
    expect(screen.getByRole("heading", { name: "Payment method" })).toBeTruthy();
  });

  it("before the first payment says where the method will show", async () => {
    vi.mocked(loadPaymentPage).mockResolvedValue({ method: { ok: true, data: { method: null, renewsOn: null } }, details: { ok: true, data: null }, canManage: true });
    const { container } = wrap(await PaymentScreen({ customer }));
    expect(screen.getByText("No payment yet")).toBeTruthy();
    expect(screen.getByText(/shows here after your first payment/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
