import "server-only";
import { findFirstPayment, findLiveBundledAddOns, listBoughtSetupServices, withTenantScope, type Payment } from "@brandbasket/db";
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

/** A first payment as the reassurance line shows it; null while it has no paid date. */
export function firstPaymentView(row: Pick<Payment, "id" | "amountCents" | "currency" | "paidAt"> | null): FirstPaymentView | null {
  return row === null || row.paidAt === null
    ? null
    : { amount: formatMoney(row.amountCents, row.currency), paidOn: dayMonth(row.paidAt), receiptHref: receiptDownloadHref([row.id]) };
}

export interface FirstLookData {
  readonly services: readonly ServiceKey[];
  readonly payment: FirstPaymentView | null;
}

/** The services the plan pays for now. A failed read shows none, so a page still draws. */
export async function loadServicesBought(tenant: TenantContext): Promise<readonly ServiceKey[]> {
  return withTenantScope(getAppDb(), tenant, (tx) => findLiveBundledAddOns(tx, tenant.businessId))
    .then(servicesBought)
    .catch((error: unknown) => {
      console.error("[first-look] could not read the services", errorLogInfo(error));
      return [] as readonly ServiceKey[];
    });
}

/**
 * The services the To do page, Overview and the console all agree on: the website the plan pays for, and Social and Search
 * by the one rule in the db package (taken with the plan or bought later). Null when the read failed, so a caller can tell
 * that from a business with no services; a page treats null as none and still draws.
 */
export async function loadSetupServices(tenant: TenantContext): Promise<readonly ServiceKey[] | null> {
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const [live, setup] = await Promise.all([findLiveBundledAddOns(tx, tenant.businessId), listBoughtSetupServices(tx, tenant.businessId)]);
    return [...servicesBought(live).filter((service) => service === "website"), ...setup];
  }).catch((error: unknown) => {
    console.error("[first-look] could not read the services", errorLogInfo(error));
    return null;
  });
}

/**
 * The services bought and the first payment, read as the customer. Neither may break the page: a failed payment read
 * only hides the paid line, and a failed services read shows the call without the per-service lists.
 */
export async function loadFirstLook(tenant: TenantContext): Promise<FirstLookData> {
  const db = getAppDb();
  const services = await loadServicesBought(tenant);
  const payment = await withTenantScope(db, tenant, (tx) => findFirstPayment(tx, tenant.businessId))
    .then(firstPaymentView)
    .catch((error: unknown) => {
      console.error("[first-look] could not read the first payment", errorLogInfo(error));
      return null;
    });
  return { services, payment };
}
