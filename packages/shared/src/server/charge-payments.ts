import "server-only";
import {
  findChargeForBusiness,
  findPaymentLinkByAdvanceChargeId,
  markAdvancePaid,
  openMembershipForListingBusiness,
  recordChargePayment,
  type ChargePayment,
  type OpenedMembership,
  type RecordedChargePayment,
  type ScopedTransaction,
} from "@brandbasket/db";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

export interface RecordedChargePaymentWithEffects extends RecordedChargePayment {
  /**
   * Set when this payment was a deal's advance and it turned a free listing account into a website client (plan 66), in this
   * transaction. Once it commits, the caller gives the business the Payload tenant every client has (syncTenantForBusiness).
   * Null for every other payment, and for a payment already recorded.
   */
  readonly openedMembership: OpenedMembership | null;
}

/**
 * recordChargePayment, then what the charge buys that is not the charge itself, then the tax invoice for a charge it settled,
 * last and in a savepoint (D7). Every charge payment path goes through this, on the staff connection, under the business's
 * billing lock. A payment that did not settle its charge (a duplicate, a wrong amount, a stale move up) bought nothing and
 * gets no invoice (D1) and no effects.
 *
 * A `website_advance` charge (plan 66, payment 1 of a paid deal) marks the deal's advance paid and opens the project, in the
 * payment's own transaction, so the money and the start never disagree. A second delivery of the same payment is
 * `alreadyRecorded` and does nothing more; a business that is already a client keeps the project it has (openMembership
 * returns null for it).
 */
export async function recordChargePaymentWithInvoice(tx: ScopedTransaction, input: ChargePayment): Promise<RecordedChargePaymentWithEffects> {
  const recorded = await recordChargePayment(tx, input);
  let openedMembership: OpenedMembership | null = null;
  if (recorded.outcome === "paid" && !recorded.alreadyRecorded) {
    const charge = await findChargeForBusiness(tx, input.businessId, input.chargeId);
    if (charge?.kind === "website_advance") {
      const link = await findPaymentLinkByAdvanceChargeId(tx, charge.id);
      if (link === null) throw new Error(`The advance charge ${charge.id} belongs to no payment link`);
      await markAdvancePaid(tx, { linkId: link.id, paidAt: input.paidAt });
      openedMembership = await openMembershipForListingBusiness(tx, input.businessId, { withProject: true, websiteKind: link.websiteKind });
    }
    await issueTaxInvoiceSafely(tx, recorded.payment, { kind: "charge", chargeId: input.chargeId });
  }
  return { ...recorded, openedMembership };
}
