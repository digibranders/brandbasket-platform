import "server-only";
import { findFirstPayment, findLiveBundledAddOns, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { receiptDownloadHref } from "@/lib/billing/receipt-download";
import { dayMonth } from "@/lib/call-dates";
import { servicesBought, type ServiceKey } from "@/lib/first-look";
import { getAppDb } from "./db";

/** The reassurance line under the welcome: what was paid, when, and the receipt. */
export interface FirstPaymentView {
  readonly amount: string;
  readonly paidOn: string;
  readonly receiptHref: string;
}

export interface FirstLookData {
  readonly services: readonly ServiceKey[];
  readonly payment: FirstPaymentView | null;
}

/**
 * The services bought and the first payment, read as the customer. Neither may break the page: a failed payment read
 * only hides the paid line, and a failed services read shows the call without the per-service lists.
 */
export async function loadFirstLook(tenant: TenantContext): Promise<FirstLookData> {
  const db = getAppDb();
  const services = await withTenantScope(db, tenant, (tx) => findLiveBundledAddOns(tx, tenant.businessId))
    .then(servicesBought)
    .catch((error: unknown) => {
      console.error("[first-look] could not read the services", errorLogInfo(error));
      return [] as readonly ServiceKey[];
    });
  const payment = await withTenantScope(db, tenant, (tx) => findFirstPayment(tx, tenant.businessId))
    .then((row): FirstPaymentView | null =>
      row === null || row.paidAt === null
        ? null
        : { amount: formatMoney(row.amountCents, row.currency), paidOn: dayMonth(row.paidAt), receiptHref: receiptDownloadHref([row.id]) },
    )
    .catch((error: unknown) => {
      console.error("[first-look] could not read the first payment", errorLogInfo(error));
      return null;
    });
  return { services, payment };
}
