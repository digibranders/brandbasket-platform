import "server-only";
import { findFirstPayment, findTaxInvoiceByPaymentId, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { purchaseEventFrom, type PurchaseEvent } from "@/lib/purchase-event";
import { getAppDb } from "./db";

/**
 * The customer's first payment as the welcome popup reports it to Tag Manager (plan 59), or null when there is none or it
 * cannot be read: a failed read must never break the page the popup sits on. Read as the customer; they can see their own
 * payments and tax invoices.
 */
export async function loadFirstPaymentEvent(tenant: TenantContext): Promise<PurchaseEvent | null> {
  try {
    return await withTenantScope(getAppDb(), tenant, async (tx) => {
      const payment = await findFirstPayment(tx, tenant.businessId);
      if (payment === null) return null;
      const invoice = await findTaxInvoiceByPaymentId(tx, payment.id);
      return purchaseEventFrom(payment, invoice === null ? null : invoice.cgstCents + invoice.sgstCents + invoice.igstCents);
    });
  } catch (error) {
    console.error("[conversions] The first payment could not be read for the welcome.", error instanceof Error ? error.name : "error");
    return null;
  }
}
