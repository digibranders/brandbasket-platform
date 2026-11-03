import "server-only";
import { findFirstPayment, findTaxInvoiceByPaymentId, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { getAppDb } from "@/lib/db";
import { load, type Loaded } from "@/lib/loaded";
import { purchaseEventFrom, type PurchaseEvent } from "./purchase-event";

/**
 * The customer's first payment as the browser reports it to Tag Manager (plan 59), or null when there is none. Read as the
 * customer; they can see their own payments and tax invoices. Ported from apps/platform lib/server/first-payment-event.ts,
 * which swallowed a failed read: here it is reported and returned as a failure, and the caller renders no push.
 */
export function loadFirstPaymentEvent(tenant: TenantContext): Promise<Loaded<PurchaseEvent | null>> {
  return load("conversions.first-payment-event", () =>
    withTenantScope(getAppDb(), tenant, async (tx) => {
      const payment = await findFirstPayment(tx, tenant.businessId);
      if (payment === null) return null;
      const invoice = await findTaxInvoiceByPaymentId(tx, payment.id);
      return purchaseEventFrom(payment, invoice === null ? null : invoice.cgstCents + invoice.sgstCents + invoice.igstCents);
    }),
  );
}
