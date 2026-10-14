import "server-only";
import {
  createDirectoryDeal,
  findClaimForBusiness,
  listOwnDeals,
  removeDirectoryDeal,
  turnOnPageTab,
  updateDirectoryDeal,
  withTenantScope,
  type DirectoryClaim,
  type DirectoryDeal,
  type DirectoryDealFields,
} from "@firstfold/db";
import { localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { DIRECTORY_DEALS_TIME_ZONE } from "@firstfold/shared/lib/directory/deals-contract";
import { createNotice, type DealsNotice } from "@/lib/deals";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/** What the Deals page shows: the business's claim (null before it has one), its deals and today's date. */
export interface DealsPage {
  readonly claim: DirectoryClaim | null;
  readonly deals: readonly DirectoryDeal[];
  readonly today: string;
}

/** The business's own calendar day; every opened market is in India. */
export function dealsToday(now: Date): string {
  return localDateIn(DIRECTORY_DEALS_TIME_ZONE, now);
}

export async function getDealsPage(customer: Pick<GrantedCustomer, "tenant">, now: Date): Promise<DealsPage> {
  const { tenant } = customer;
  const [claim, deals] = await withTenantScope(getAppDb(), tenant, (tx) =>
    Promise.all([findClaimForBusiness(tx, tenant.businessId), listOwnDeals(tx, tenant.businessId)]),
  );
  return { claim, deals, today: dealsToday(now) };
}

/** Posts a deal at once and says what happened. Every rule is checked again in the database transaction. */
export async function postCustomerDeal(customer: Pick<GrantedCustomer, "tenant" | "user">, fields: DirectoryDealFields, now: Date): Promise<DealsNotice> {
  const { tenant, user } = customer;
  const outcome = await createDirectoryDeal(getStaffDb(), { businessId: tenant.businessId, userId: user.id, fields, today: dealsToday(now) });
  if (outcome.kind !== "created") return createNotice(outcome, false);
  // The first deal an owner posts puts the Offers tab on their page; after that the tab is theirs to turn off.
  if ((await listOwnDeals(getStaffDb(), tenant.businessId)).length === 1) {
    await turnOnPageTab(getStaffDb(), { businessId: tenant.businessId, tab: "offers", now });
  }
  const claim = await withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  return createNotice(outcome, claim?.status === "approved");
}

export async function editCustomerDeal(customer: Pick<GrantedCustomer, "tenant">, dealId: string, fields: DirectoryDealFields): Promise<DealsNotice> {
  const saved = await updateDirectoryDeal(getStaffDb(), { businessId: customer.tenant.businessId, dealId, fields });
  return saved ? "saved" : "not-found";
}

export async function removeCustomerDeal(customer: Pick<GrantedCustomer, "tenant">, dealId: string, now: Date): Promise<DealsNotice> {
  const removed = await removeDirectoryDeal(getStaffDb(), { businessId: customer.tenant.businessId, dealId, now });
  return removed ? "removed" : "not-found";
}
