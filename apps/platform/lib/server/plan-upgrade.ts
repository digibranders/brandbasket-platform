import "server-only";
import {
  consumeRateLimit,
  findLatestSubscriptionForBusiness,
  findPlanById,
  findPlanUpgradeInFlight,
  type Plan,
  type PlanUpgrade,
  type RateLimitRule,
} from "@firstfold/db";
import {
  assessUpgrade,
  readAssessmentInput,
  startUpgrade,
  type UpgradeAssessment,
} from "@firstfold/shared/server/plan-upgrade";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { startCustomerChargePayment, type ChargePaymentStart } from "./charges";
import { finishUpgrade } from "./plan-upgrade-finish";

/*
 * Moving up from Care to Premium, for the signed-in customer (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-
 * design.md). The rules and the money are in @firstfold/shared/server/plan-upgrade; this reads and acts for one customer,
 * and finishes the move after their payment.
 */

/** A stuck button or a script must not be able to open charges without limit. */
export const UPGRADE_RATE_LIMIT: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };

const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";

/** What the Upgrade page shows. */
export interface UpgradePage {
  readonly assessment: UpgradeAssessment;
  /**
   * The move in flight, if any: open (a charge waiting to be paid), or paid and waiting for the renewal. The page says
   * what is happening for the second, and offers to pay for the first.
   */
  readonly inFlight: PlanUpgrade | null;
  /**
   * The plan the subscription is actually billed on: Care's, until a paid move up is taken at its renewal. The customer's
   * billing state (`customer.billing.plan`) already shows the plan they have moved to, so the page cannot read the Care
   * plan's price from there once the move is paid for.
   */
  readonly billedPlan: Plan | null;
}

/** The customer's own reading, fresh from the database: the page never trusts a cached billing state for money. */
export async function readUpgradePage(customer: Pick<GrantedCustomer, "tenant">, now: Date): Promise<UpgradePage | null> {
  const { businessId } = customer.tenant;
  const input = await readAssessmentInput(getStaffDb(), businessId, getBillingProvider().name, now);
  if (input === null) return null;
  const inFlight = await findPlanUpgradeInFlight(getStaffDb(), businessId);
  const raw = await findLatestSubscriptionForBusiness(getStaffDb(), businessId);
  const billedPlan = raw === null ? null : await findPlanById(getStaffDb(), raw.planId);
  return { assessment: assessUpgrade(input), inFlight, billedPlan };
}

/** What asking to move up came to, for the page's action. */
export type UpgradeAction =
  /** Send the customer to pay the charge. */
  | { readonly kind: "pay"; readonly start: ChargePaymentStart }
  /** Nothing to pay: the client is Premium now. */
  | { readonly kind: "applied" }
  | { readonly kind: "refused"; readonly message: string };

/** Why a refusal reads as it does. Fixed words: nothing from a request is ever shown. */
const REFUSALS = {
  blocked: "You can’t move up from here right now. The Upgrade page says why.",
  unavailable: "We can’t take an upgrade just yet. Email us and we’ll sort it out.",
  changed: "Your plan changed while you were on that page, so nothing was charged. Reload it and look again.",
} as const;

/**
 * Asks to move up: the quote is worked out again from the database under the business's billing lock, and its charge is
 * opened (or the open one for the same quote is found), whatever the page showed. The customer is then sent to pay it.
 * A move with nothing to take is applied at once and finished at the provider.
 */
export async function startUpgradeFor(customer: GrantedCustomer, now: Date): Promise<UpgradeAction> {
  const { tenant } = customer;
  const budget = await consumeRateLimit(getAppDb(), `upgrade:business:${tenant.businessId}`, UPGRADE_RATE_LIMIT);
  if (!budget.allowed) return { kind: "refused", message: TOO_MANY_ATTEMPTS };

  const provider = getBillingProvider();
  const started = await startUpgrade(getStaffDb(), {
    businessId: tenant.businessId,
    source: "customer",
    staffId: null,
    providerName: provider.name,
    now,
  });
  switch (started.kind) {
    case "refused":
      return { kind: "refused", message: REFUSALS[started.assessment.kind] };
    case "changed":
      return { kind: "refused", message: REFUSALS.changed };
    case "applied":
      await finishUpgrade(started.upgrade.id, now);
      return { kind: "applied" };
    case "pay":
      return { kind: "pay", start: await startCustomerChargePayment(customer, started.chargeId) };
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled upgrade start: ${JSON.stringify(unhandled)}`);
    }
  }
}
