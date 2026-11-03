import "server-only";
import Razorpay from "razorpay";
import {
  createBillingProvider,
  createRazorpayProvider,
  resolveBillingProviderName,
  wrapRazorpaySdkClient,
  type BillingProvider,
} from "@brandbasket/billing";
import {
  findChargeByProviderOrder,
  findSubscriptionByProviderId,
  listReceiptsForBusiness,
  listTaxInvoicesForPayments,
  withTenantScope,
  type Receipt,
  type TaxInvoice,
} from "@brandbasket/db";
import { MAX_RECEIPTS_PER_DOWNLOAD } from "@brandbasket/shared/lib/billing/receipt-download";
import { serverEnv } from "@/lib/env";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/*
 * Ported from apps/platform lib/server/billing.ts: the billing provider, the Razorpay key id, and the receipts reads. The
 * access guards it held are src/lib/guards.ts here.
 */

const holder = globalThis as typeof globalThis & { brandbasketCustomerBillingProvider?: BillingProvider };

/** Reads a Razorpay env var required only when BILLING_PROVIDER=razorpay, so a deployment on the fake provider never needs it set. */
function requiredRazorpayEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} must be set: BILLING_PROVIDER=razorpay needs it.`);
  return value;
}

/**
 * The provider BILLING_PROVIDER names. Outside production an unset value means the fake provider; in production it must be
 * set, and resolving it throws otherwise rather than handing out plans for free. The fake provider is also refused on a real
 * deployment unless BRANDBASKET_ALLOW_FAKE_BILLING=1 (resolveBillingProviderName). The Razorpay webhook stays in
 * apps/platform, so this app needs no webhook secret.
 */
export function getBillingProvider(): BillingProvider {
  if (holder.brandbasketCustomerBillingProvider !== undefined) return holder.brandbasketCustomerBillingProvider;
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
    holder.brandbasketCustomerBillingProvider = createRazorpayProvider({
      keySecret,
      client: wrapRazorpaySdkClient(new Razorpay({ key_id: keyId, key_secret: keySecret })),
      resolveBusinessId: async (providerSubscriptionId) => (await findSubscriptionByProviderId(getStaffDb(), "razorpay", providerSubscriptionId))?.businessId ?? null,
      resolveChargeOrder: async (providerOrderId) => {
        const charge = await findChargeByProviderOrder(getStaffDb(), "razorpay", providerOrderId);
        return charge === null ? null : { businessId: charge.businessId, chargeId: charge.id };
      },
    });
  } else {
    // The fake provider signs its test checkout tokens with the app's auth secret, as apps/platform does, so a token from one
    // app is only accepted by an app sharing that secret.
    holder.brandbasketCustomerBillingProvider = createBillingProvider(name, { authSecret: serverEnv().BETTER_AUTH_SECRET });
  }
  return holder.brandbasketCustomerBillingProvider;
}

/**
 * The key id Razorpay Checkout opens with, read when the page is served and passed to the browser as a prop. Not a
 * NEXT_PUBLIC_ variable, which would be compiled in at build time. The key id is not secret.
 */
export function razorpayKeyId(): string {
  return requiredRazorpayEnv("RAZORPAY_KEY_ID");
}

/** True only when payments are simulated locally. The test checkout pages do not exist otherwise. */
export function isFakeBillingProvider(): boolean {
  return getBillingProvider().name === "fake";
}

/** The signed-in customer's payments with the term each bought, newest first, read through row-level security. */
export async function listCustomerReceipts(customer: Pick<GrantedCustomer, "tenant">): Promise<Receipt[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listReceiptsForBusiness(tx, tenant.businessId, MAX_RECEIPTS_PER_DOWNLOAD));
}

/** The tax invoices for some of the customer's payments, oldest first. Through row-level security. */
export async function listCustomerTaxInvoices(customer: Pick<GrantedCustomer, "tenant">, paymentIds: readonly string[]): Promise<TaxInvoice[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listTaxInvoicesForPayments(tx, tenant.businessId, paymentIds));
}
