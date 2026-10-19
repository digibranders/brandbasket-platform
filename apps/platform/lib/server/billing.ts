import "server-only";
import Razorpay from "razorpay";
import {
  createBillingProvider,
  createRazorpayProvider,
  resolveBillingProviderName,
  wrapRazorpaySdkClient,
  type BillingProvider,
  type RazorpayBillingProvider,
} from "@brandbasket/billing";
import {
  findActivePlan,
  findChargeByProviderOrder,
  findCurrentPaymentMethod,
  findSubscriptionByProviderId,
  listReceiptsForBusiness,
  listTaxInvoicesForPayments,
  withTenantScope,
  type CurrentPaymentMethod,
  type Plan,
  type Receipt,
  type TaxInvoice,
} from "@brandbasket/db";
import { requireCustomerAccess, type GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { serverEnv } from "@/lib/server/env";
import { renewsAutomatically } from "@/lib/billing/payment-method-view";
import { MAX_RECEIPTS_PER_DOWNLOAD } from "@/lib/billing/receipt-download";

/**
 * A write that needs the first payment was attempted by a business that has not paid (or has lapsed). It carries no
 * customer-facing copy: each caller decides what to show.
 */
export class BillingRequiredError extends Error {
  readonly businessId: string;

  constructor(businessId: string) {
    super(`Business ${businessId} has no paid subscription, so this action is not available.`);
    this.name = "BillingRequiredError";
    this.businessId = businessId;
  }
}

/**
 * The guard every mutating customer action that needs payment runs first. The dashboard is readable before payment so
 * people can see what they are buying, and drafts save freely; sending onboarding, and everything that comes after
 * it, waits for the first payment. A disabled button in the browser is a courtesy, not a control: a server action
 * can be called directly, so the action itself must call this.
 */
export async function requireBillingAccess(): Promise<GrantedCustomer> {
  const access = await requireCustomerAccess();
  if (!access.billing.hasAccess) throw new BillingRequiredError(access.tenant.businessId);
  return access;
}

const holder = globalThis as typeof globalThis & {
  brandbasketBillingProvider?: BillingProvider;
  /** The same object as brandbasketBillingProvider, when that is Razorpay's, with its Razorpay-only methods typed. */
  brandbasketRazorpayProvider?: RazorpayBillingProvider;
};

/** Reads a Razorpay env var required only when BILLING_PROVIDER=razorpay, so a deployment still on the fake
 * provider never needs it set. */
function requiredRazorpayEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set: BILLING_PROVIDER=razorpay needs it.`);
  }
  return value;
}

/**
 * The provider BILLING_PROVIDER names. Outside production an unset value means the fake provider; in production it
 * must be set, and resolving it throws otherwise rather than handing out dashboards for free. The fake provider is
 * also refused on a real deployment unless BRANDBASKET_ALLOW_FAKE_BILLING=1 (see resolveBillingProviderName).
 *
 * Razorpay is constructed here directly rather than through `createBillingProvider`/`factory.ts`: that factory only
 * builds providers that need no injected dependencies (today, just the fake one), and Razorpay needs a real SDK
 * client plus a database-backed `resolveBusinessId`. `factory.ts`'s "razorpay" case stays a permanent throwing stub
 * by design; this function bypasses it for that provider.
 */
export function getBillingProvider(): BillingProvider {
  if (holder.brandbasketBillingProvider !== undefined) return holder.brandbasketBillingProvider;

  const name = resolveBillingProviderName({
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    BRANDBASKET_ALLOW_FAKE_BILLING: process.env.BRANDBASKET_ALLOW_FAKE_BILLING,
  });

  if (name === "razorpay") {
    const keyId = requiredRazorpayEnv("RAZORPAY_KEY_ID");
    const keySecret = requiredRazorpayEnv("RAZORPAY_KEY_SECRET");
    holder.brandbasketRazorpayProvider = createRazorpayProvider({
      keySecret,
      client: wrapRazorpaySdkClient(new Razorpay({ key_id: keyId, key_secret: keySecret })),
      resolveBusinessId: async (providerSubscriptionId) => {
        const subscription = await findSubscriptionByProviderId(getStaffDb(), "razorpay", providerSubscriptionId);
        return subscription?.businessId ?? null;
      },
      resolveChargeOrder: async (providerOrderId) => {
        const charge = await findChargeByProviderOrder(getStaffDb(), "razorpay", providerOrderId);
        return charge === null ? null : { businessId: charge.businessId, chargeId: charge.id };
      },
    });
    holder.brandbasketBillingProvider = holder.brandbasketRazorpayProvider;
  } else {
    holder.brandbasketBillingProvider = createBillingProvider(name, { authSecret: serverEnv().BETTER_AUTH_SECRET });
  }
  return holder.brandbasketBillingProvider;
}

/**
 * The Razorpay provider, for what only Razorpay does (the webhook reading a subscription's current status). Throws
 * when BILLING_PROVIDER names another provider: nothing should ask Razorpay anything then.
 */
export function getRazorpayProvider(): RazorpayBillingProvider {
  getBillingProvider();
  if (holder.brandbasketRazorpayProvider === undefined) {
    throw new Error("BILLING_PROVIDER is not razorpay, so there is no Razorpay provider to call.");
  }
  return holder.brandbasketRazorpayProvider;
}

/**
 * Read directly (not through `getBillingProvider`, which also requires the key id/secret): the webhook route only
 * needs the webhook secret, and must not fail to boot in a configuration that has RAZORPAY_KEY_ID/SECRET set but is
 * still running the fake provider during rollout.
 */
export function razorpayWebhookSecret(): string {
  return requiredRazorpayEnv("RAZORPAY_WEBHOOK_SECRET");
}

/**
 * The key id Razorpay Checkout opens with, read when the page is served and passed to the browser as a prop. Not a
 * NEXT_PUBLIC_ variable: those are compiled in at build time, and the server's build environment holds no billing
 * settings. The key id is not secret; Checkout needs it in the page.
 */
export function razorpayKeyId(): string {
  return requiredRazorpayEnv("RAZORPAY_KEY_ID");
}

/**
 * The secret Razorpay signs a checkout return with, read when the return arrives. Server only: it is never sent to the
 * browser.
 */
export function razorpayKeySecret(): string {
  return requiredRazorpayEnv("RAZORPAY_KEY_SECRET");
}

/** True only when payments are simulated locally. The test checkout page does not exist otherwise. */
export function isFakeBillingProvider(): boolean {
  return getBillingProvider().name === "fake";
}

/** How many payments the receipts list shows, and so the most one receipts download can include. */
export const RECEIPTS_SHOWN = MAX_RECEIPTS_PER_DOWNLOAD;

/** The signed-in customer's payments with the term each bought, newest first, read through row-level security. */
export async function listCustomerReceipts(customer: Pick<GrantedCustomer, "tenant">): Promise<Receipt[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listReceiptsForBusiness(tx, tenant.businessId, RECEIPTS_SHOWN));
}

/** The tax invoices for some of the customer's payments, oldest first. Works through row-level security. */
export async function listCustomerTaxInvoices(
  customer: Pick<GrantedCustomer, "tenant">,
  paymentIds: readonly string[],
): Promise<TaxInvoice[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listTaxInvoicesForPayments(tx, tenant.businessId, paymentIds));
}

/**
 * How the signed-in customer pays now, or null before their first payment. When the plan renews by itself only plan
 * payments are looked at, so a charge staff recorded or a paid extra cannot name the method it renews on. Read through
 * row-level security.
 */
export async function findCustomerPaymentMethod(
  customer: Pick<GrantedCustomer, "tenant" | "billing">,
): Promise<CurrentPaymentMethod | null> {
  const { tenant } = customer;
  const planOnly = renewsAutomatically(customer.billing);
  return withTenantScope(getAppDb(), tenant, (tx) => findCurrentPaymentMethod(tx, tenant.businessId, { planOnly }));
}

/**
 * The plan a lapsed customer reactivates on: the one on sale today for their tier and currency, never the version they
 * lapsed on (docs/superpowers/specs/2026-10-09-reactivation-design.md). Null for a customer who has not lapsed, or whose
 * tier has nothing on sale in their currency. The checkout works the plan out again under its lock; this is for showing it.
 */
export async function findReactivationPlan(customer: Pick<GrantedCustomer, "billing">): Promise<Plan | null> {
  const { billing } = customer;
  if (billing.status !== "lapsed" || billing.plan === null) return null;
  return findActivePlan(getStaffDb(), billing.plan.currency, billing.tier);
}
