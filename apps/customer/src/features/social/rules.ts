import type { ConnectedAccount, Deliverable, MonthlySnapshot } from "@brandbasket/db";
import { addDays, localDateIn, mondayOf } from "@brandbasket/shared/lib/calendar/local-date";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { z } from "zod";
import type { CustomerContext } from "@/lib/guards";
import { APP_TIME_ZONE, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { TabLink } from "@/ui";

/*
 * Social & Ads, as pure rules (plan 61, section 4). Ported from apps/platform lib/social/week.ts, ads.ts and notices.ts, with
 * the eligibility rule of the approve action. No I/O here.
 */

export const SOCIAL_PATH = "/social";
export const SOCIAL_CONTENT_PATH = "/social/content";
export const SOCIAL_ADS_PATH = "/social/ads";
export const SOCIAL_ACCOUNTS_PATH = "/social/accounts";
/** The New request dialog (owned by Requests) with Social & Ads chosen. */
export const ASK_FOR_CHANGE_HREF = "/requests?new=1&kind=social";
/** Plan & billing with Social & Ads ready to add. */
export const ADD_SOCIAL_HREF = "/billing?add=social";

/** A post's picture, served by the route beside the pages. */
export function postImagePath(id: string): string {
  return `/social/images/${id}`;
}

/** The New request dialog opened about one post (ported: lib/requests/links.ts). */
export function changePostHref(id: string): string {
  return `${ASK_FOR_CHANGE_HREF}&about=${id}`;
}

/** One social post as the pages read it. */
export interface PostView {
  readonly id: string;
  readonly title: string;
  readonly caption: string | null;
  /** `YYYY-MM-DD`. */
  readonly dueOn: string;
  readonly status: "planned" | "awaiting_approval" | "approved" | "published";
  readonly hasImage: boolean;
  readonly format: Deliverable["format"];
  readonly channel: Deliverable["channel"];
}

export type PostRow = Pick<Deliverable, "id" | "kind" | "title" | "caption" | "dueOn" | "status" | "imageKey" | "format" | "channel">;

/** A row with no day, or not a post, is left out: the database requires a day for a post, so none should exist. */
export function postViews(rows: readonly PostRow[]): PostView[] {
  return rows.flatMap((row): PostView[] =>
    row.kind !== "post" || row.dueOn === null
      ? []
      : [{ id: row.id, title: row.title, caption: row.caption, dueOn: row.dueOn, status: row.status, hasImage: row.imageKey !== null, format: row.format, channel: row.channel }],
  );
}

// ---- Dates ----

/** A post's due date (`YYYY-MM-DD`) as a moment: noon in India, so no zone shifts it to another day. */
export function dueDate(dueOn: string): Date {
  return new Date(`${dueOn}T12:00:00+05:30`);
}

/** "Tue 1 Dec". */
export function dueLabel(dueOn: string, now: Date = new Date()): string {
  return formatDate(dueDate(dueOn), now);
}

/** The first day of the India month `now` falls in, as `YYYY-MM-01` (monthly_snapshots.month). */
export function monthKey(now: Date): string {
  return `${localDateIn(APP_TIME_ZONE, now).slice(0, 7)}-01`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** "November". */
export function monthName(now: Date): string {
  return MONTH_NAMES[Number(monthKey(now).slice(5, 7)) - 1] ?? "";
}

/** Monday and Sunday (`YYYY-MM-DD`) of the India week containing `now`. */
export function weekBounds(now: Date): { readonly from: string; readonly to: string } {
  const from = mondayOf(localDateIn(APP_TIME_ZONE, now));
  return { from, to: addDays(from, 6) };
}

/** The last day (`YYYY-MM-DD`) of the India month `now` falls in. */
function monthEnd(now: Date): string {
  const [year = 0, month = 0] = monthKey(now).split("-").map(Number);
  return addDays(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), -1);
}

/** The days Social & Ads and Local SEO + AEO load: this India month, stretched to the end of the week when that week runs into the next. */
export function postWindow(now: Date): { readonly from: string; readonly to: string } {
  const end = monthEnd(now);
  const weekEnd = weekBounds(now).to;
  return { from: monthKey(now), to: weekEnd > end ? weekEnd : end };
}

// ---- Posts ----

const byDueDate = (a: PostView, b: PostView): number => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id);

/** `waiting` is every post awaiting approval; `thisWeek` is every post due this India week, whatever its status. */
export function splitPosts(posts: readonly PostView[], now: Date): { readonly waiting: PostView[]; readonly thisWeek: PostView[] } {
  const { from, to } = weekBounds(now);
  return {
    waiting: posts.filter((post) => post.status === "awaiting_approval").sort(byDueDate),
    thisWeek: posts.filter((post) => post.dueOn >= from && post.dueOn <= to).sort(byDueDate),
  };
}

/** The earliest due date among the waiting posts, as a label; null when none are waiting. */
export function needsOkBy(waiting: readonly PostView[], now: Date = new Date()): string | null {
  const first = waiting.map((post) => post.dueOn).sort()[0];
  return first === undefined ? null : dueLabel(first, now);
}

export function waitingHeadline(waiting: readonly PostView[], now: Date = new Date()): string {
  const by = needsOkBy(waiting, now);
  if (by === null) return "No posts are waiting for you.";
  return waiting.length === 1 ? `1 post needs your OK by ${by}` : `${waiting.length} posts need your OK by ${by}`;
}

/** The post's channel and format in one phrase: "Instagram reel". Either may be missing on posts made before the columns existed. */
export function postKindLabel(format: PostView["format"], channel: PostView["channel"]): string {
  const channelWord = channel === null ? null : CHANNEL_NAMES[channel];
  const formatWord = format ?? null;
  if (channelWord !== null && formatWord !== null) return `${channelWord} ${formatWord}`;
  if (channelWord !== null) return channelWord;
  return formatWord === null ? "Post" : `${formatWord.charAt(0).toUpperCase()}${formatWord.slice(1)}`;
}

/** The status key of the shared StatusBadge for a post. */
export function postStatusKey(status: PostView["status"]): "planned" | "needs_approval" | "approved" | "published" {
  return status === "awaiting_approval" ? "needs_approval" : status;
}

/** "November: 12 of 14 posts out." from the posts due this month; null when there are none. */
export function monthLine(posts: readonly PostView[], now: Date): string | null {
  const counts = monthCounts(posts, now);
  return counts === null ? null : `${monthName(now)}: ${counts.published} of ${counts.total} posts out.`;
}

/** How many of this month's posts are out; null when there are none. */
export function monthCounts(posts: readonly PostView[], now: Date): { readonly published: number; readonly total: number } | null {
  const prefix = monthKey(now).slice(0, 7);
  const inMonth = posts.filter((post) => post.dueOn.startsWith(prefix));
  if (inMonth.length === 0) return null;
  return { published: inMonth.filter((post) => post.status === "published").length, total: inMonth.length };
}

// ---- Approving ----

/** The database function approves between 1 and this many posts at a time. */
export const MAX_APPROVE = 50;
export const VIEWER_MESSAGE = "Only owners and editors can change this.";

/** Viewers read; the database refuses their writes. A lapsed plan reads too, but cannot approve (the action needs a paid period). */
export function canApprove(customer: Pick<CustomerContext, "role" | "billing">): boolean {
  return customer.role !== "viewer" && customer.billing.status === "paid";
}

/** The ids "Approve all" sends: the waiting posts, earliest first, at most as many as one approval may carry. */
export function approveAllIds(waiting: readonly PostView[]): string[] {
  return waiting.filter((post) => post.status === "awaiting_approval").slice(0, MAX_APPROVE).map((post) => post.id);
}

export function approveAllLabel(count: number): string {
  return count === 1 ? "Approve" : `Approve all ${formatNumber(count)}`;
}

/** The posts the browser names: each a UUID, once, between 1 and 50. */
export const approveIdsSchema = z
  .array(z.uuid("Those posts could not be found."))
  .transform((ids) => [...new Set(ids)])
  .pipe(z.array(z.string()).min(1, "Choose a post to approve.").max(MAX_APPROVE, `Approve ${MAX_APPROVE} posts or fewer at a time.`));

export type ApprovalOutcome = "approved" | "changed";

/** Fewer approved than asked means some posts changed since the page loaded. */
export function approvalOutcome(approved: number, requested: number): ApprovalOutcome {
  return approved === requested ? "approved" : "changed";
}

export const APPROVAL_NOTICES: Readonly<Record<ApprovalOutcome | "failed", { readonly ok: boolean; readonly text: string }>> = {
  approved: { ok: true, text: "Approved. Thank you, we will publish on the dates shown." },
  changed: { ok: false, text: "Some posts changed while you were looking. Check them below and try again." },
  failed: { ok: false, text: "We could not save that. Try again." },
};

/** A waiting post as the approvals list draws it: plain strings, so it can cross to the browser. */
export interface ApprovalCard {
  readonly id: string;
  readonly title: string;
  readonly caption: string | null;
  /** "Instagram reel". */
  readonly kind: string;
  /** "Wed 25 Nov". */
  readonly when: string;
  readonly imageSrc: string | null;
  readonly changeHref: string;
}

export function approvalCards(waiting: readonly PostView[], now: Date): ApprovalCard[] {
  return waiting.map((post) => ({
    id: post.id,
    title: post.title,
    caption: post.caption,
    kind: postKindLabel(post.format, post.channel),
    when: dueLabel(post.dueOn, now),
    imageSrc: post.hasImage ? postImagePath(post.id) : null,
    changeHref: changePostHref(post.id),
  }));
}

// ---- Calendar ----

export interface CalendarDay {
  readonly date: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly today: boolean;
  readonly posts: readonly PostView[];
}

/** The weeks (Monday first) that cover this India month, each day with its posts. */
export function monthCalendar(posts: readonly PostView[], now: Date): CalendarDay[][] {
  const first = monthKey(now);
  const last = monthEnd(now);
  const today = localDateIn(APP_TIME_ZONE, now);
  const sorted = [...posts].sort(byDueDate);
  const weeks: CalendarDay[][] = [];
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, offset): CalendarDay => {
        const date = addDays(start, offset);
        return { date, day: Number(date.slice(8, 10)), inMonth: date >= first && date <= last, today: date === today, posts: sorted.filter((post) => post.dueOn === date) };
      }),
    );
  }
  return weeks;
}

/** The weekday names the calendar's header row uses, Monday first. */
export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ---- Ads ----

/** The ads figures for the month, each null when it is not known. */
export interface AdsView {
  readonly spentCents: number | null;
  readonly budgetCents: number | null;
  /** Spent as a share of the budget, 0 to 100; null without both. */
  readonly percent: number | null;
  readonly spent: string | null;
  readonly budget: string | null;
  readonly leads: number | null;
  readonly costPerLead: string | null;
  /** The ad money we add each month, from the subscription; null when there is none. */
  readonly adMoney: string | null;
  /** When staff last updated the figures. */
  readonly updatedAt: Date | null;
}

type SnapshotFigures = Pick<MonthlySnapshot, "adSpendCents" | "adBudgetCents" | "adEnquiries" | "updatedAt">;

/**
 * The ads panel's figures, or null when nothing is known: the panels are left out, never shown as zeros. Cost per lead is
 * worked out only from a measured spend and at least one measured lead.
 */
export function adsView(input: { readonly snapshot: SnapshotFigures | null; readonly adCreditCents: number; readonly currency: MoneyCurrency }): AdsView | null {
  const { snapshot, adCreditCents, currency } = input;
  const spend = snapshot?.adSpendCents ?? null;
  const budget = snapshot?.adBudgetCents ?? null;
  const leads = snapshot?.adEnquiries ?? null;
  const hasBudget = budget !== null && budget > 0;
  const view: AdsView = {
    spentCents: spend,
    budgetCents: hasBudget ? budget : null,
    percent: spend === null || !hasBudget ? null : Math.min(100, Math.max(0, Math.round((spend / budget) * 100))),
    spent: spend === null ? null : formatMoney(spend, currency),
    budget: hasBudget ? formatMoney(budget, currency) : null,
    leads,
    costPerLead: spend === null || leads === null || leads <= 0 ? null : formatMoney(Math.round(spend / leads), currency),
    adMoney: adCreditCents > 0 ? formatMoney(adCreditCents, currency) : null,
    updatedAt: spend === null && budget === null && leads === null ? null : (snapshot?.updatedAt ?? null),
  };
  return spend === null && !hasBudget && leads === null && view.adMoney === null ? null : view;
}

// ---- Connected accounts ----

type Platform = ConnectedAccount["platform"];

export const CHANNEL_NAMES: Readonly<Record<NonNullable<PostView["channel"]>, string>> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google_business: "Google profile",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

const PLATFORM_ROWS: Readonly<Record<Platform, { readonly label: string; readonly icon: "FacebookLogo" | "InstagramLogo" | "MapPinArea" | "VideoCamera" | "Link" | "WhatsappLogo" }>> = {
  instagram: { label: "Instagram", icon: "InstagramLogo" },
  facebook: { label: "Facebook Page", icon: "FacebookLogo" },
  google_business: { label: "Google Business Profile", icon: "MapPinArea" },
  youtube: { label: "YouTube", icon: "VideoCamera" },
  linkedin: { label: "LinkedIn", icon: "Link" },
  x: { label: "X", icon: "Link" },
  whatsapp_business: { label: "WhatsApp Business", icon: "WhatsappLogo" },
};
const PLATFORM_ORDER = Object.keys(PLATFORM_ROWS) as Platform[];

export interface AccountRow {
  readonly platform: Platform;
  readonly label: string;
  readonly icon: (typeof PLATFORM_ROWS)[Platform]["icon"];
  /** The handle, or the page's name. */
  readonly handle: string | null;
  /** https only; anything else is not a link. */
  readonly url: string | null;
  readonly status: ConnectedAccount["status"];
  readonly checkedAt: Date | null;
}

/** The accounts in the order the screen lists them. A stored link that is not https is dropped. */
export function accountRows(accounts: readonly Pick<ConnectedAccount, "platform" | "handle" | "url" | "status" | "checkedAt">[]): AccountRow[] {
  return [...accounts]
    .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform))
    .map((account) => ({
      platform: account.platform,
      ...PLATFORM_ROWS[account.platform],
      handle: account.handle,
      url: account.url !== null && account.url.startsWith("https://") ? account.url : null,
      status: account.status,
      checkedAt: account.checkedAt,
    }));
}

// ---- Tabs ----

/** The section's tabs. The Content tab carries the number of posts waiting, when it is known and not zero. */
export function socialTabs(waiting: number | null): readonly TabLink[] {
  return [
    { href: SOCIAL_PATH, label: "Overview" },
    { href: SOCIAL_CONTENT_PATH, label: "Content", ...(waiting === null || waiting === 0 ? {} : { count: formatNumber(waiting) }) },
    { href: SOCIAL_ADS_PATH, label: "Ads" },
    { href: SOCIAL_ACCOUNTS_PATH, label: "Accounts" },
  ];
}

/** The monthly report's link when it is a safe one. Only https is a link. */
export function reportHref(url: string | null | undefined): string | null {
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}
