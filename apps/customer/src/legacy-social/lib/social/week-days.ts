import { dayLabel } from "./auto";
import type { WrittenBatch, WrittenPost } from "./ai";
import { staysInMonth } from "./plan-window";
import { WEEKDAYS, WEEKDAY_SHORT, weekdaysOf, type Weekday } from "./schedule";

/*
 * "Use these days every week": when she has arranged one week the way she wants (a topic moved to another day), the days that week now has
 * become the days of every other week that can still change, and of the plans written afterwards. This works out which topics of the other
 * weeks would move and which weeks cannot change; the screen counts from it, and the server acts from it, so both read the same plan.
 */

const DAY_MS = 86_400_000;

/** `day` (`YYYY-MM-DD`) shifted by `days`. */
export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export interface DayMove {
  readonly batchId: string;
  readonly postId: string;
  /** The day the topic is on now. */
  readonly from: string;
  /** The day it would go to. */
  readonly day: string;
  /** The Monday of its week. */
  readonly weekFrom: string;
}

/** Why some topics of a week stay where they are: the week is drawn (or has passed), a day has passed, the day is past the paid month, or the week has more topics than days. */
export type SkipReason = "drawn" | "lapsed" | "passed" | "month" | "extra";

export interface WeekSkip {
  /** The Monday of the week. */
  readonly weekFrom: string;
  readonly reason: SkipReason;
  /** How many topics stay. */
  readonly count: number;
}

export interface EveryWeekPlan {
  /** The days of the week she arranged, in week order: the days of every week from now on. */
  readonly days: readonly Weekday[];
  readonly moves: readonly DayMove[];
  /** The Mondays of the weeks that get at least one move. */
  readonly weeksChanged: readonly string[];
  readonly skipped: readonly WeekSkip[];
}

/** The topics of a week that count as posts: not the ones she dropped (a topic written in place of a dropped one counts). */
function livePosts(batch: WrittenBatch, postIds: readonly string[]): WrittenPost[] {
  return postIds.flatMap((id) => {
    const post = batch.posts.find((one) => one.id === id);
    return post === undefined || post.state === "dropped" || post.date === null ? [] : [post];
  });
}

/**
 * The plan for making the days of one week the days of every other week.
 * - The days are the weekdays the week's topics are on now.
 * - In each other week that can still change, its open topics are put on those days in order: the earliest topic on the first day, and so on. A week with fewer topics uses the first days; a week with more keeps the extra ones where they are.
 * - A topic stays when its new day is today or has passed, or lies past the paid month, and a week that is drawn (or has passed) stays whole.
 * `batches` are the plan's batches, not the one-topic batches of topics she wrote herself. `today` is `YYYY-MM-DD` ("" when not known) and `renewsOn` the renewal day (null when not known).
 */
export function planEveryWeek(input: { readonly batches: readonly WrittenBatch[]; readonly batchId: string; readonly weekFrom: string; readonly today: string; readonly renewsOn: string | null }): EveryWeekPlan | null {
  const { batches, batchId, weekFrom, today, renewsOn } = input;
  const source = batches.find((batch) => batch.id === batchId);
  const week = source?.weeks?.find((one) => one.from === weekFrom);
  if (source === undefined || week === undefined) return null;
  const live = livePosts(source, week.postIds);
  const days = weekdaysOf(live.flatMap((post) => (post.date === null ? [] : [post.date])));
  if (days.length === 0) return null;
  const earliest = today === "" ? "" : addDays(today, 1);

  const moves: DayMove[] = [];
  const skipped: WeekSkip[] = [];
  const changed: string[] = [];
  for (const batch of batches) {
    for (const other of batch.weeks ?? []) {
      if (batch.id === batchId && other.from === weekFrom) continue;
      const here = livePosts(batch, other.postIds);
      if (here.length === 0) continue;
      const open = new Set(other.openPostIds ?? (other.state === "waiting" ? other.postIds : []));
      if (open.size === 0) {
        skipped.push({ weekFrom: other.from, reason: other.state === "lapsed" ? "lapsed" : "drawn", count: here.length });
        continue;
      }
      const posts = here.filter((post) => open.has(post.id)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
      let extra = 0;
      let passed = 0;
      let month = 0;
      posts.forEach((post, index) => {
        const weekday = days[index];
        if (weekday === undefined) {
          extra += 1;
          return;
        }
        const day = addDays(other.from, WEEKDAYS.indexOf(weekday));
        if (day === post.date) return;
        if (earliest !== "" && day < earliest) {
          passed += 1;
          return;
        }
        if (!staysInMonth(post.date, day, renewsOn)) {
          month += 1;
          return;
        }
        moves.push({ batchId: batch.id, postId: post.id, from: post.date ?? "", day, weekFrom: other.from });
        if (!changed.includes(other.from)) changed.push(other.from);
      });
      if (extra > 0) skipped.push({ weekFrom: other.from, reason: "extra", count: extra });
      if (passed > 0) skipped.push({ weekFrom: other.from, reason: "passed", count: passed });
      if (month > 0) skipped.push({ weekFrom: other.from, reason: "month", count: month });
    }
  }
  return { days, moves, weeksChanged: changed.sort(), skipped };
}

/** "Tue, Wed and Thu". */
export const daysWords = (days: readonly Weekday[]): string => {
  const names = days.map((day) => WEEKDAY_SHORT[day]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
};

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);
const weekWord = (from: string): string => dayLabel(from, { day: "numeric", month: "short" });
const listOf = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`);

/**
 * The one line she reads after "every week": the days now in use, how many other weeks changed, which stayed and why, and the topics whose words
 * name a day. `done` is what was moved; `failed` the moves the posting service refused (a week drawn in the meantime, say).
 */
export function everyWeekSummary(plan: EveryWeekPlan, result: { readonly weeksChanged: number; readonly namesADay: number; readonly failed: number; /** The days were saved for the plans written from now on. */ readonly saved: boolean }): string {
  const parts: string[] = [`Every week now uses ${daysWords(plan.days)}.`];
  parts.push(result.weeksChanged === 0 ? "The other weeks already had these days." : `${String(result.weeksChanged)} other ${plural(result.weeksChanged, "week", "weeks")} changed.`);
  const closed = plan.skipped.filter((skip) => skip.reason === "drawn").map((skip) => weekWord(skip.weekFrom));
  if (closed.length > 0) parts.push(`The ${plural(closed.length, "week", "weeks")} of ${listOf(closed)} ${plural(closed.length, "is", "are")} already drawn, so ${plural(closed.length, "it stays", "they stay")}.`);
  const lapsed = plan.skipped.filter((skip) => skip.reason === "lapsed").map((skip) => weekWord(skip.weekFrom));
  if (lapsed.length > 0) parts.push(`The ${plural(lapsed.length, "week", "weeks")} of ${listOf(lapsed)} ${plural(lapsed.length, "has", "have")} passed.`);
  const passed = plan.skipped.filter((skip) => skip.reason === "passed").reduce((sum, skip) => sum + skip.count, 0);
  if (passed > 0) parts.push(`${String(passed)} ${plural(passed, "topic", "topics")} stayed because its new day has passed.`);
  const month = plan.skipped.filter((skip) => skip.reason === "month").reduce((sum, skip) => sum + skip.count, 0);
  if (month > 0) parts.push(`${String(month)} ${plural(month, "topic", "topics")} stayed because its new day is after your month ends.`);
  const extra = plan.skipped.filter((skip) => skip.reason === "extra").reduce((sum, skip) => sum + skip.count, 0);
  if (extra > 0) parts.push(`${String(extra)} extra ${plural(extra, "topic", "topics")} in a longer week kept ${plural(extra, "its", "their")} day.`);
  if (result.failed > 0) parts.push(`${String(result.failed)} ${plural(result.failed, "topic", "topics")} could not be moved just now.`);
  if (!result.saved) parts.push("The next plan could not be set to these days just now.");
  if (result.namesADay > 0) parts.push(`${String(result.namesADay)} ${plural(result.namesADay, "topic names", "topics name")} a day: read ${plural(result.namesADay, "its", "their")} words again.`);
  return parts.join(" ");
}
