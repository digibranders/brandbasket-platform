import "server-only";
import { findSearchConnection, listDeliverablesForBusiness, listMonthlySnapshots, listSearchDays, listSearchLists, withTenantScope } from "@brandbasket/db";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { isCustomerSearchEnabled } from "@brandbasket/shared/lib/launch-flags";
import { monthKey, monthName, postWindow } from "@/features/social/rules";
import { listMonths } from "@/features/website/rules/visits";
import { getAppDb } from "@/lib/db";
import { APP_TIME_ZONE } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { doneThisMonth, pageOne, type DoneItem, type PageOne } from "./rules";
import { SEARCH_LOOKBACK_DAYS, searchLists, searchSummary, type SearchPresence } from "./rules/search-presence";

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

/**
 * How people find the customer on Google. Null while CUSTOMER_SEARCH_ENABLED is off, so nothing is read and nothing is drawn.
 * Data is null when there is no Search Console connection (or it was removed). A connection with no measured day yet is
 * "waiting"; otherwise the 28 days ending at the last measured day, and the month's top lists when they were pulled.
 * shortcut: reads the last SEARCH_LOOKBACK_DAYS days to find the last measured day, so a job silent for longer reads as waiting; upgrade with a max-day query.
 */
export function loadSearchPresence(tenant: TenantContext, now: Date): Promise<Loaded<SearchPresence | null>> | null {
  if (!isCustomerSearchEnabled()) return null;
  return load("search.presence", () =>
    withTenantScope(getAppDb(), tenant, async (tx): Promise<SearchPresence | null> => {
      const connection = await findSearchConnection(tx);
      if (connection === null || connection.status === "removed") return null;
      const today = dayKey(now.toISOString(), APP_TIME_ZONE);
      const summary = searchSummary(await listSearchDays(tx, addDays(today, -SEARCH_LOOKBACK_DAYS), today));
      if (summary === null) return { kind: "waiting" };
      const months = listMonths(now);
      const lists =
        searchLists(months.current, await listSearchLists(tx, months.current)) ?? searchLists(months.previous, await listSearchLists(tx, months.previous));
      return { kind: "measured", summary, lists };
    }),
  );
}
