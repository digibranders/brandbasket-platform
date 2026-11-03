import "server-only";
import { listDeliverablesForBusiness, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import { monthKey, monthName, postWindow } from "@/features/social/rules";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { doneThisMonth, pageOne, type DoneItem, type PageOne } from "./rules";

type Reader = Pick<CustomerContext, "tenant" | "businessId">;

export interface SearchNumbers {
  readonly pageOne: PageOne | null;
  readonly month: string;
}

/** The month's page-one count that staff entered in `monthly_snapshots`. Each read is its own panel: a failure throws. */
export async function loadSearchNumbers(customer: Reader, now: Date): Promise<SearchNumbers> {
  const snapshots = await withTenantScope(getAppDb(), customer.tenant, (tx) => listMonthlySnapshots(tx, customer.businessId, monthKey(now)));
  return { pageOne: pageOne(snapshots.find((row) => row.service === "search") ?? null), month: monthName(now) };
}

export interface SearchWork {
  readonly items: readonly DoneItem[];
  readonly month: string;
}

/** The pages we improved and the listings we fixed this month. */
export async function loadSearchWork(customer: Reader, now: Date): Promise<SearchWork> {
  const window = postWindow(now);
  const rows = await withTenantScope(getAppDb(), customer.tenant, (tx) =>
    listDeliverablesForBusiness(tx, customer.businessId, { service: "search", from: window.from, to: window.to }),
  );
  return { items: doneThisMonth(rows, monthKey(now)), month: monthName(now) };
}
