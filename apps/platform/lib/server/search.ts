import "server-only";
import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { monthKey, monthName } from "@/lib/overview";
import { searchSummary, type SearchSummary } from "@/lib/search/summary";
import { postWindow } from "@/lib/social/week";
import type { TodoItem } from "@/lib/todo";
import { getAppDb } from "./db";
import { quietly } from "./quietly";
import { loadTodo } from "./todo";

type DeliverableRow = Awaited<ReturnType<typeof listDeliverablesForBusiness>>[number];

export interface SearchData {
  readonly summary: SearchSummary;
  /** The open Search items on the To do page. */
  readonly waiting: readonly TodoItem[];
  /** The address of the latest monthly report, when staff have added one. */
  readonly report: string | null;
  /** The month's name, for the headings ("November"). */
  readonly month: string;
}

/**
 * Everything the Search page shows, or null when the business has not bought Search. Each read is its own failure: one
 * that fails leaves that part out and the page still draws. The summary only counts work dated inside the month.
 */
export async function loadSearch(tenant: TenantContext, now: Date): Promise<SearchData | null> {
  const db = getAppDb();
  const bought = await withTenantScope(db, tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("search")) return null;
  const window = postWindow(now);
  const month = monthKey(now);
  const [rows, snapshots, report, todo] = await Promise.all([
    quietly("search", "the finished work", [] as DeliverableRow[], () =>
      withTenantScope(db, tenant, (tx) => listDeliverablesForBusiness(tx, tenant.businessId, { service: "search", from: window.from, to: window.to })),
    ),
    quietly("search", "the monthly numbers", [], () => withTenantScope(db, tenant, (tx) => listMonthlySnapshots(tx, tenant.businessId, month))),
    quietly("search", "the monthly report", null, () => withTenantScope(db, tenant, (tx) => latestMonthlyReport(tx, tenant.businessId, "search"))),
    loadTodo(tenant),
  ]);
  const items = rows.flatMap((row) => (row.kind === "page" || row.kind === "listing" ? [{ id: row.id, kind: row.kind, title: row.title, status: row.status, dueOn: row.dueOn, linkUrl: row.linkUrl }] : []));
  return {
    summary: searchSummary({ snapshot: snapshots.find((row) => row.service === "search") ?? null, items, month }),
    waiting: todo.items.filter((item) => item.service === "search" && !item.done),
    report: report?.url ?? null,
    month: monthName(now),
  };
}
