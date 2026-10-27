import { addDays, localDateIn, mondayOf } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE, shortDay } from "@/lib/call-dates";
import { monthKey, monthName } from "@/lib/overview";

/** One social post as the Social & Ads page reads it. */
export interface PostView {
  readonly id: string;
  readonly title: string;
  readonly caption: string | null;
  readonly dueOn: string;
  readonly status: "planned" | "awaiting_approval" | "approved" | "published";
  readonly hasImage: boolean;
  readonly linkUrl: string | null;
}

/** A post's due date (`YYYY-MM-DD`) as a moment: noon in India, so no zone shifts it to another day. */
export function dueDate(dueOn: string): Date {
  return new Date(`${dueOn}T12:00:00+05:30`);
}

/** "Tue 1 Dec". */
export function dueLabel(dueOn: string): string {
  return shortDay(dueOn);
}

/** The earliest due date among the waiting posts, as a label; null when none are waiting. */
export function needsOkBy(waiting: readonly PostView[]): string | null {
  const dates = waiting.map((post) => post.dueOn).sort();
  return dates[0] === undefined ? null : dueLabel(dates[0]);
}

export function waitingHeadline(waiting: readonly PostView[]): string {
  const by = needsOkBy(waiting);
  if (by === null) return "No posts are waiting for you.";
  return waiting.length === 1 ? `1 post needs your OK by ${by}` : `${waiting.length} posts need your OK by ${by}`;
}

export function approveAllLabel(count: number): string {
  return count === 1 ? "Approve" : `Approve all ${count}`;
}

/** Monday and Sunday (`YYYY-MM-DD`) of the India week containing `now`. */
export function weekBounds(now: Date): { readonly from: string; readonly to: string } {
  const from = mondayOf(localDateIn(BRAND_TIME_ZONE, now));
  return { from, to: addDays(from, 6) };
}

const byDueDate = (a: PostView, b: PostView): number => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id);

/** `waiting` is every post awaiting approval; `thisWeek` is every post due this India week, whatever its status. */
export function splitPosts(posts: readonly PostView[], now: Date): { readonly waiting: PostView[]; readonly thisWeek: PostView[] } {
  const { from, to } = weekBounds(now);
  return {
    waiting: posts.filter((post) => post.status === "awaiting_approval").sort(byDueDate),
    thisWeek: posts.filter((post) => post.dueOn >= from && post.dueOn <= to).sort(byDueDate),
  };
}

export function statusWord(status: PostView["status"]): "Planned" | "Needs your OK" | "Approved" | "Published" {
  switch (status) {
    case "planned":
      return "Planned";
    case "awaiting_approval":
      return "Needs your OK";
    case "approved":
      return "Approved";
    case "published":
      return "Published";
  }
}

/** "1 of 4", for the phone view (`index` counts from 0). */
export function postPosition(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

/** "November: 12 of 14 posts out." from the posts due this month; null when there are none. */
export function monthLine(posts: readonly PostView[], now: Date): string | null {
  const prefix = monthKey(now).slice(0, 7);
  const inMonth = posts.filter((post) => post.dueOn.startsWith(prefix));
  if (inMonth.length === 0) return null;
  const out = inMonth.filter((post) => post.status === "published").length;
  return `${monthName(now)}: ${out} of ${inMonth.length} posts out.`;
}
