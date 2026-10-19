import "server-only";
import { randomUUID } from "node:crypto";
import {
  BillingBusinessNotFoundError,
  findBillingState,
  findChargeForBusiness,
  insertCharge,
  listChargesForBusiness,
  lockBusinessForBilling,
  waiveCharge,
  type Charge,
  type ChargePaymentOutcome,
} from "@brandbasket/db";
import { chargeAmountCents, chargePricing } from "@brandbasket/shared/lib/billing/charges";
import type { ChargeRequest } from "@brandbasket/shared/lib/billing/charge-form";
import type { ManualPaymentDetails } from "@brandbasket/shared/lib/billing/manual-payment-form";
import { recordChargePaymentWithInvoice } from "@brandbasket/shared/server/charge-payments";
import { getStaffDb } from "./db";
import { finishUpgradeForChargeAfterManualPayment } from "./plan-upgrade-admin";

/** How many charges one client page lists. */
const CHARGES_SHOWN = 50;

/** The client's charges, newest first: open ones to act on, and the paid and waived history. */
export async function listClientCharges(businessId: string): Promise<Charge[]> {
  return listChargesForBusiness(getStaffDb(), businessId, { limit: CHARGES_SHOWN });
}

export type AddChargeOutcome = { readonly kind: "added"; readonly charge: Charge } | { readonly kind: "no-plan" };

/**
 * Adds a charge for a client, priced from their plan (the one they subscribe on, or the active plan for their
 * currency), in the plan's currency and with its tax. Only a custom charge carries a price staff typed. The caller
 * must have checked the signed-in staff member.
 */
export async function addClientCharge(
  input: { readonly businessId: string; readonly staffUserId: string; readonly request: ChargeRequest },
): Promise<AddChargeOutcome> {
  const db = getStaffDb();
  const state = await findBillingState(db, input.businessId);
  if (state === null) throw new BillingBusinessNotFoundError(input.businessId);
  const { plan } = state;
  if (plan === null) return { kind: "no-plan" };

  const { request } = input;
  const pricing = chargePricing(request.kind, plan);
  const unitAmountCents = request.customUnitAmountCents ?? pricing.unitAmountCents;
  if (unitAmountCents === null) throw new Error(`A ${request.kind} charge needs a price`);
  const charge = await insertCharge(db, {
    businessId: input.businessId,
    kind: request.kind,
    description: request.description ?? pricing.description,
    quantity: request.quantity,
    unitAmountCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    amountCents: chargeAmountCents(unitAmountCents, request.quantity, plan.taxRateBasisPoints),
    currency: plan.currency,
    createdByStaffId: input.staffUserId,
  });
  return { kind: "added", charge };
}

export type MarkChargePaidOutcome = ChargePaymentOutcome | "not-found";

/**
 * Records a bank transfer that pays one of the client's open charges: the charge's own amount, who recorded it, the
 * reference and the date the money arrived. A charge that is no longer open is refused before anything is written,
 * so staff cannot record a second payment for it by accident.
 */
export async function markClientChargePaid(
  input: {
    readonly businessId: string;
    readonly chargeId: string;
    readonly staffUserId: string;
    readonly details: ManualPaymentDetails;
  },
  now: Date,
): Promise<MarkChargePaidOutcome> {
  const outcome = await getStaffDb().transaction(async (tx) => {
    await lockBusinessForBilling(tx, input.businessId);
    const charge = await findChargeForBusiness(tx, input.businessId, input.chargeId);
    if (charge === null) return "not-found";
    if (charge.status !== "open") return "not-open";
    const recorded = await recordChargePaymentWithInvoice(tx, {
      chargeId: charge.id,
      businessId: input.businessId,
      provider: "manual",
      providerPaymentId: `manual_charge_${randomUUID()}`,
      amountCents: charge.amountCents,
      currency: charge.currency,
      paidAt: now,
      now,
      manual: {
        recordedByStaffId: input.staffUserId,
        reference: input.details.reference,
        receivedOn: input.details.receivedOn,
      },
    });
    return recorded.outcome;
  });
  // A bank transfer that pays for a move up: the client has Premium (the payment's transaction set it); the provider is
  // told now, after that has committed. Does nothing for any other charge.
  if (outcome === "paid") await finishUpgradeForChargeAfterManualPayment(input.chargeId, now);
  return outcome;
}

/** Waives one of the client's open charges. False when it was not open. */
export async function waiveClientCharge(
  input: { readonly businessId: string; readonly chargeId: string; readonly staffUserId: string },
  now: Date,
): Promise<boolean> {
  return waiveCharge(getStaffDb(), {
    chargeId: input.chargeId,
    businessId: input.businessId,
    staffId: input.staffUserId,
    now,
  });
}
