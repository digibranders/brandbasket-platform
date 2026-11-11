import "server-only";
import { findActivePlan, findCurrentPaymentMethod, withTenantScope, type CurrentPaymentMethod, type Plan } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { reactivationNetCents, readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { loadCarriedCode, loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { getAppDb, getStaffDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { discountFrom } from "../../checkout/server/referrals";
import { renewsAutomatically } from "../rules";

/*
 * Ported from apps/platform lib/server/billing.ts: the payment method and the reactivation reads. The reactivation basket and
 * the code a lapse keeps are read on the staff connection, as the checkout does when it reopens them (checkout/server/checkout.ts
 * startReactivationFor): the shared reads need tables the customer role cannot see, and the business is the session's.
 */

type Customer = Pick<CustomerContext, "tenant" | "billing">;

/** The newest payment's method (payment_method_details), or null before any payment. Through row-level security. */
export async function findCustomerPaymentMethod(customer: Customer): Promise<CurrentPaymentMethod | null> {
  const { tenant } = customer;
  const planOnly = renewsAutomatically(customer.billing);
  return withTenantScope(getAppDb(), tenant, (tx) => findCurrentPaymentMethod(tx, tenant.businessId, { planOnly }));
}

/**
 * The plan a lapsed customer reactivates on: the one on sale today for their tier and currency, never the version they lapsed
 * on. Null for a customer who has not lapsed, or whose tier has nothing on sale in their currency.
 */
export async function findReactivationPlan(customer: Pick<CustomerContext, "billing">): Promise<Plan | null> {
  const { billing } = customer;
  if (billing.status !== "lapsed" || billing.plan === null) return null;
  // A price on sale is public (it is on the website), so it is read on the staff connection like the checkout's plan.
  return findActivePlan(getStaffDb(), billing.plan.currency, billing.tier);
}

/** What Billing shows a lapsed customer about coming back. */
export interface ReactivationView {
  /** The customer cancelled the plan themselves: they choose their services again, each at its own price. */
  readonly cancelled: boolean;
  /** The services the payment is for: the ones chosen when `cancelled` (the lapsed ones until they choose), else the lapsed basket. */
  readonly services: readonly MonthlyAddOnId[];
  /** What a month of them costs, GST included. */
  readonly netCents: number;
  /** What the code a lapse keeps takes off that; 0 for a customer who cancelled themselves or whose code has no months left. */
  readonly discountCents: number;
}

/**
 * What a month of the basket a lapsed customer reactivates costs, GST included, from the same basket the checkout reopens,
 * less the discount of the code a lapse keeps, so the price on Billing is the one charged. A customer who cancelled themselves
 * chooses again: `requested` is priced at list instead, and only catalogue services count; with none left, their previous
 * ones are shown. Null for a customer who has not lapsed, or whose currency has no plan.
 */
export async function findReactivation(customer: Customer, requested: readonly string[] = []): Promise<ReactivationView | null> {
  const { billing, tenant } = customer;
  if (billing.status !== "lapsed" || billing.plan === null) return null;
  const basket = await loadReactivationBasket(getStaffDb(), tenant.businessId);
  const chosen = basket.cancelled ? readBundleSelection(requested) : [];
  const priced = chosen.length === 0 ? basket : { ...basket, services: chosen };
  const { currency } = billing.plan;
  const netCents = reactivationNetCents(priced, currency);
  const carried = await loadCarriedCode(getStaffDb(), tenant.businessId, basket);
  const discountCents = carried === null ? 0 : (discountFrom(carried.code, { currency, netCents })?.amountCents ?? 0);
  return { cancelled: basket.cancelled, services: priced.services, netCents, discountCents };
}
