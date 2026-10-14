import "server-only";
import Razorpay from "razorpay";
import {
  createBillingProvider,
  createRazorpayProvider,
  resolveBillingProviderName,
  wrapRazorpaySdkClient,
  type BillingProvider,
} from "@fynix/billing";
import { findChargeByProviderOrder, findSubscriptionByProviderId } from "@fynix/db";
import { getStaffDb } from "./db";
import { serverEnv } from "@/lib/server/env";

/**
 * The billing provider, for staff work only.
 *
 * A deliberately narrow copy of the platform's billing module: that one also holds the customer-facing payment
 * guards, which pull in the customer session and the row-level-security-bound connection. The admin has neither
 * and should never acquire them, so it takes the provider factory alone.
 */

const holder = globalThis as typeof globalThis & { fynixBillingProvider?: BillingProvider };

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
 * also refused on a real deployment unless FYNIX_ALLOW_FAKE_BILLING=1 (see resolveBillingProviderName).
 *
 * Razorpay is constructed here directly rather than through `createBillingProvider`/`factory.ts`: that factory only
 * builds providers that need no injected dependencies (today, just the fake one), and Razorpay needs a real SDK
 * client plus a database-backed `resolveBusinessId`. `factory.ts`'s "razorpay" case stays a permanent throwing stub
 * by design; this function bypasses it for that provider.
 */
export function getBillingProvider(): BillingProvider {
  if (holder.fynixBillingProvider !== undefined) return holder.fynixBillingProvider;

  const name = resolveBillingProviderName({
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    FYNIX_ALLOW_FAKE_BILLING: process.env.FYNIX_ALLOW_FAKE_BILLING,
  });

  if (name === "razorpay") {
    const keyId = requiredRazorpayEnv("RAZORPAY_KEY_ID");
    const keySecret = requiredRazorpayEnv("RAZORPAY_KEY_SECRET");
    holder.fynixBillingProvider = createRazorpayProvider({
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
  } else {
    holder.fynixBillingProvider = createBillingProvider(name, { authSecret: serverEnv().BETTER_AUTH_SECRET });
  }
  return holder.fynixBillingProvider;
}
