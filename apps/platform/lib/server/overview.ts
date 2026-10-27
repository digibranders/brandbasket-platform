import "server-only";
import { countChatbotLeadsSince, listActivityEvents, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { nextPaymentDate } from "@brandbasket/shared/lib/billing/period";
import { nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { paymentsContinue } from "@/lib/billing/payments-continue";
import { activityRows, monthKey, monthStart, resultLines, type ActivityRow, type ResultLine, type SnapshotView } from "@/lib/overview";
import type { ServiceKey } from "@/lib/first-look";
import { getAppDb } from "./db";
import { getLiveWebsite, getProjectOverview, type ProjectOverview } from "./onboarding";
import { quietly } from "./quietly";
import { loadTodo, type TodoData } from "./todo";

export interface OverviewData {
  readonly services: readonly ServiceKey[];
  readonly open: number;
  readonly todo: TodoData["items"];
  readonly results: readonly ResultLine[];
  readonly activity: readonly ActivityRow[];
  readonly nextPayment: { readonly date: Date; readonly amount: string | null } | null;
}

const toView = (row: SnapshotView): SnapshotView => ({
  adSpendCents: row.adSpendCents,
  adBudgetCents: row.adBudgetCents,
  adEnquiries: row.adEnquiries,
  postsPublished: row.postsPublished,
  postsPlanned: row.postsPlanned,
  keywordsPageOne: row.keywordsPageOne,
  keywordsPageOnePrev: row.keywordsPageOnePrev,
});

const NO_PROJECT: ProjectOverview = { project: null, completed: [] };

export async function loadOverview(tenant: TenantContext, billing: CustomerBilling, now: Date): Promise<OverviewData> {
  const todo = await loadTodo(tenant);
  const db = getAppDb();
  const [leads, snapshots, events, overview, live] = await Promise.all([
    todo.services.includes("website")
      ? quietly("overview", "chatbot leads", 0, () => withTenantScope(db, tenant, (tx) => countChatbotLeadsSince(tx, tenant.businessId, monthStart(now))))
      : Promise.resolve(0),
    quietly("overview", "monthly numbers", [], () => withTenantScope(db, tenant, (tx) => listMonthlySnapshots(tx, tenant.businessId, monthKey(now)))),
    quietly("overview", "updates", [], () => withTenantScope(db, tenant, (tx) => listActivityEvents(tx, tenant.businessId, 8))),
    quietly("overview", "the project", NO_PROJECT, getProjectOverview),
    quietly("overview", "the live website", null, getLiveWebsite),
  ]);
  const social = snapshots.find((row) => row.service === "social");
  const search = snapshots.find((row) => row.service === "search");
  const subscription = billing.subscription;
  const date = !billing.hasAccess || subscription === null || !paymentsContinue(subscription) ? null : nextPaymentDate(subscription, now);
  const amount =
    subscription === null || billing.plan === null ? null : renewalCharge(billing.plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  return {
    services: todo.services,
    open: todo.open,
    todo: todo.items,
    results: resultLines({ services: todo.services, chatbotLeads: leads, social: social === undefined ? null : toView(social), search: search === undefined ? null : toView(search) }),
    activity: activityRows({
      events: events.map((event) => ({ id: event.id, occurredAt: event.occurredAt, title: event.title, service: event.service })),
      previewSentAt: overview.project?.previewSentAt ?? null,
      launchedAt: live?.launchedAt ?? null,
      hostname: live?.hostname ?? null,
      limit: 6,
    }),
    nextPayment: date === null ? null : { date, amount },
  };
}
