import "server-only";
import { countChatbotLeadsSince, countIncludedEdits, countSiteEvents, listActivityEvents, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { nextPaymentDate } from "@brandbasket/shared/lib/billing/period";
import { nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { includedEditsAllowed, monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { paymentsContinue } from "@/lib/billing/payments-continue";
import { activityRows, monthKey, monthStart, resultLines, type ActivityRow, type ResultLine, type SnapshotView } from "@/lib/overview";
import type { ServiceKey } from "@/lib/first-look";
import type { WebsiteEnquiries } from "@/lib/site-events";
import { needsYouFrom, type NeedsYouRow } from "@/lib/requests/needs";
import { loadNextCall } from "./calls";
import { getAppDb } from "./db";
import { getLiveWebsite, getProjectOverview, type ProjectOverview } from "./onboarding";
import { quietly } from "./quietly";
import { loadRequestNeeds } from "./requests";
import { loadWaitingPostCount } from "./social";
import { loadTodo, type TodoData } from "./todo";

export interface OverviewData {
  readonly services: readonly ServiceKey[];
  readonly open: number;
  readonly todo: TodoData["items"];
  /** Quotes to accept and changes to check, listed above the To do items. */
  readonly requests: readonly NeedsYouRow[];
  /** The month's included edits used, or null when the plan has none (or they could not be counted). */
  readonly included: { readonly used: number; readonly allowed: number } | null;
  readonly results: readonly ResultLine[];
  readonly activity: readonly ActivityRow[];
  readonly nextPayment: { readonly date: Date; readonly amount: string | null } | null;
  /** The time of the next call after the kickoff ("Wed 2 Dec, 14:00"), or null when none is booked. */
  readonly nextCall: string | null;
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
const NO_POSTS_WAITING = { count: 0, by: null } as const;

/** The moment the India month `offset` months from the one `now` is in began. */
function monthStartOffset(now: Date, offset: number): Date {
  const [year = 0, month = 1] = monthKey(now).split("-").map(Number);
  return new Date(`${new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10)}T00:00:00+05:30`);
}

/** This month's website contacts by kind and last month's total (its chatbot leads included, so the two months compare). */
async function websiteEnquiries(tenant: TenantContext, now: Date): Promise<WebsiteEnquiries> {
  const [lastStart, thisStart, nextStart] = [monthStartOffset(now, -1), monthStartOffset(now, 0), monthStartOffset(now, 1)];
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const [current, last, leadsSinceLast, leadsSinceThis] = await Promise.all([
      countSiteEvents(tx, tenant.businessId, { from: thisStart, to: nextStart }),
      countSiteEvents(tx, tenant.businessId, { from: lastStart, to: thisStart }),
      countChatbotLeadsSince(tx, tenant.businessId, lastStart),
      countChatbotLeadsSince(tx, tenant.businessId, thisStart),
    ]);
    return { ...current, chatbot: leadsSinceThis, previous: last.call + last.whatsapp + last.form + (leadsSinceLast - leadsSinceThis) };
  });
}

export async function loadOverview(tenant: TenantContext, billing: CustomerBilling, now: Date): Promise<OverviewData> {
  const todo = await loadTodo(tenant);
  const db = getAppDb();
  const allowed = includedEditsAllowed(billing.hasWebsite);
  const [leads, snapshots, events, overview, live, needs, used, nextCall, waiting, enquiries] = await Promise.all([
    todo.services.includes("website")
      ? quietly("overview", "chatbot leads", 0, () => withTenantScope(db, tenant, (tx) => countChatbotLeadsSince(tx, tenant.businessId, monthStart(now))))
      : Promise.resolve(0),
    quietly("overview", "monthly numbers", [], () => withTenantScope(db, tenant, (tx) => listMonthlySnapshots(tx, tenant.businessId, monthKey(now)))),
    quietly("overview", "updates", [], () => withTenantScope(db, tenant, (tx) => listActivityEvents(tx, tenant.businessId, 8))),
    quietly("overview", "the project", NO_PROJECT, getProjectOverview),
    quietly("overview", "the live website", null, getLiveWebsite),
    loadRequestNeeds(tenant),
    allowed === 0
      ? Promise.resolve(null)
      : quietly("overview", "the included edits", null as number | null, () => withTenantScope(db, tenant, (tx) => countIncludedEdits(tx, tenant.businessId, monthBoundsIst(now)))),
    loadNextCall(tenant, now),
    todo.services.includes("social")
      ? quietly("overview", "the posts waiting for approval", NO_POSTS_WAITING, () => loadWaitingPostCount(tenant))
      : Promise.resolve(NO_POSTS_WAITING),
    todo.services.includes("website")
      ? quietly("overview", "the website enquiries", null as WebsiteEnquiries | null, () => websiteEnquiries(tenant, now))
      : Promise.resolve(null),
  ]);
  const postsRow: readonly NeedsYouRow[] =
    waiting.count > 0 && waiting.by !== null
      ? [{ key: "posts", label: waiting.count === 1 ? "Approve 1 post" : `Approve ${waiting.count} posts`, hint: `by ${waiting.by}`, service: "social", href: "/social" }]
      : [];
  const social = snapshots.find((row) => row.service === "social");
  const search = snapshots.find((row) => row.service === "search");
  const subscription = billing.subscription;
  const date = !billing.hasAccess || subscription === null || !paymentsContinue(subscription) ? null : nextPaymentDate(subscription, now);
  const amount =
    subscription === null || billing.plan === null ? null : renewalCharge(billing.plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  return {
    services: todo.services,
    open: todo.open + needs.length + postsRow.length,
    todo: todo.items,
    requests: [...postsRow, ...needsYouFrom(needs)],
    included: allowed === 0 || used === null ? null : { used, allowed },
    results: resultLines({ services: todo.services, chatbotLeads: leads, enquiries, social: social === undefined ? null : toView(social), search: search === undefined ? null : toView(search) }),
    activity: activityRows({
      events: events.map((event) => ({ id: event.id, occurredAt: event.occurredAt, title: event.title, service: event.service })),
      previewSentAt: overview.project?.previewSentAt ?? null,
      launchedAt: live?.launchedAt ?? null,
      hostname: live?.hostname ?? null,
      limit: 6,
    }),
    nextPayment: date === null ? null : { date, amount },
    nextCall,
  };
}
