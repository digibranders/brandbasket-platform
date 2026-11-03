import "server-only";
import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listWaitingPosts, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";
import { loadWindow, toCalendarPost, type AutoChannel, type CalendarPost } from "@/lib/social/auto";
import { monthLine, needsOkBy, postWindow, type PostView } from "@/lib/social/week";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { getAppDb } from "./db";
import { quietly } from "./quietly";
import { loadChannels, loadPosts, socialAutoSettings, type SocialAutoSettings } from "./social-auto";

/** What social-auto knows about the business: its connected channels and the posts it writes and publishes. */
export interface SocialConnect {
  /** The business's name, shown under each connected account. */
  readonly businessName: string;
  readonly channels: readonly AutoChannel[];
  readonly posts: readonly CalendarPost[];
  /** Today in India, `YYYY-MM-DD`. */
  readonly today: string;
  /** True when social-auto could not be asked, so the page says so instead of showing an empty calendar as if it were true. */
  readonly unavailable: boolean;
}

export interface SocialData {
  /** Null when social-auto is not set up on this server: the page is then the one it was before it. */
  readonly connect: SocialConnect | null;
  readonly posts: readonly PostView[];
  readonly monthLine: string | null;
  /** The address of the latest monthly report, when staff have added one. */
  readonly report: string | null;
}

/** Asks social-auto for the channels and the posts. Each is its own failure: what could be read is shown and the page says the rest could not be. */
async function loadConnect(settings: SocialAutoSettings, business: { readonly id: string; readonly name: string }, now: Date): Promise<SocialConnect> {
  const today = localDateIn(BRAND_TIME_ZONE, now);
  const [channels, posts] = await Promise.allSettled([loadChannels(settings, business.id), loadPosts(settings, business.id, loadWindow(today))]);
  for (const outcome of [channels, posts]) if (outcome.status === "rejected") console.error("[social] could not read social-auto", errorLogInfo(outcome.reason));
  return {
    businessName: business.name,
    channels: channels.status === "fulfilled" ? channels.value : [],
    posts: posts.status === "fulfilled" ? posts.value.flatMap((post) => toCalendarPost(post) ?? []) : [],
    today,
    unavailable: channels.status === "rejected" || posts.status === "rejected",
  };
}

type DeliverableRow = Awaited<ReturnType<typeof listWaitingPosts>>[number];

/** A post row as the page reads it. A row with no day is left out: the database requires one for a post, so none should exist. */
function postViews(rows: readonly DeliverableRow[]): PostView[] {
  return rows.flatMap((row): PostView[] =>
    row.kind !== "post" || row.dueOn === null
      ? []
      : [{ id: row.id, title: row.title, caption: row.caption, dueOn: row.dueOn, status: row.status, hasImage: row.imageKey !== null, linkUrl: row.linkUrl }],
  );
}

/**
 * Everything the Social media page shows, or null when the business has not bought Social media. Posts are this month's
 * plus the rest of the current week, and any post waiting for the customer's OK whatever its day. Each read is its own
 * failure: one that fails leaves that part out and the page still draws.
 */
export async function loadSocial(tenant: TenantContext, now: Date): Promise<SocialData | null> {
  const db = getAppDb();
  const bought = await withTenantScope(db, tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) return null;
  const window = postWindow(now);
  const settings = await quietly("social", "the social-auto settings", null, async () => socialAutoSettings());
  const [rows, report, connect] = await Promise.all([
    quietly("social", "the posts", [] as DeliverableRow[], () =>
      withTenantScope(db, tenant, (tx) => listDeliverablesForBusiness(tx, tenant.businessId, { service: "social", from: window.from, to: window.to })),
    ),
    quietly("social", "the monthly report", null, () => withTenantScope(db, tenant, (tx) => latestMonthlyReport(tx, tenant.businessId, "social"))),
    settings === null ? Promise.resolve(null) : loadConnect(settings, { id: tenant.businessId, name: tenant.businessName }, now),
  ]);
  const posts = postViews(rows);
  return {
    connect,
    posts,
    monthLine: monthLine(posts, now),
    report: report?.url ?? null,
  };
}

/** How many posts wait for the customer's OK and the earliest day among them, for Overview. Call it through quietly. */
export async function loadWaitingPostCount(tenant: TenantContext): Promise<{ count: number; by: string | null }> {
  const rows = await withTenantScope(getAppDb(), tenant, (tx) => listWaitingPosts(tx, tenant.businessId));
  const waiting = postViews(rows);
  return { count: waiting.length, by: needsOkBy(waiting) };
}
