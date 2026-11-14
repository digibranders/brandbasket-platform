import type { BatchWeek, Poster } from "./ai";
import type { ChannelPlatform } from "./auto";
import type { ReviewCard, ReviewGroup } from "./review-cards";

/**
 * Every post goes out at 10:00 India time: the posting service has no other time for a post today, and the review screen says so
 * beside each date. When posts can be given another time, the screen reads it from the post instead.
 */
export const POST_TIME = "10:00";

/** One week of the review screen: the posts of one batch that fall in one Monday-to-Sunday week, and where its pictures stand. */
export interface FlowWeek {
  /** Unique across batches: the batch and the Monday the week starts. */
  readonly key: string;
  readonly batchId: string;
  /** The Monday it starts and the Sunday it ends, `YYYY-MM-DD`; empty for a batch drawn in one piece that carries no days. */
  readonly from: string;
  readonly to: string;
  readonly state: BatchWeek["state"];
  readonly postIds: readonly string[];
  /** The week is sent in whole (a batch with no weeks): the draw does not name a week. */
  readonly whole: boolean;
  /** How many dropped posts of the week can still get a new topic; null when the posting service does not say. */
  readonly replacementsLeft: number | null;
}

/**
 * The weeks of every batch in one list, oldest first. A batch with weeks gives each of its weeks; one without gives a single week
 * of all its posts, drawn or being drawn when its pictures were asked for; one whose posts are no longer listed (it was drawn and
 * only its pictures are left) gives a drawn week of those pictures' posts.
 */
export function flowWeeks(groups: readonly ReviewGroup[], drawing: readonly string[]): FlowWeek[] {
  const weeks = groups.flatMap((group): FlowWeek[] => {
    const batch = group.batch;
    if (batch !== null && batch.weeks !== null && batch.weeks.length > 0) {
      return batch.weeks.map((week) => ({ key: `${group.batchId}:${week.from}`, batchId: group.batchId, from: week.from, to: week.to, state: week.state, postIds: week.postIds, whole: false, replacementsLeft: week.replacementsLeft ?? null }));
    }
    const dates = batch === null ? [] : batch.posts.flatMap((post) => (post.date === null ? [] : [post.date.slice(0, 10)])).sort();
    const asked = drawing.includes(group.batchId);
    return [
      {
        key: `${group.batchId}:`,
        batchId: group.batchId,
        from: dates[0] ?? "",
        to: dates[dates.length - 1] ?? "",
        state: batch === null ? "drawn" : asked ? "drawing" : "waiting",
        postIds: group.cards.map((card) => card.postId),
        whole: true,
        replacementsLeft: null,
      },
    ];
  });
  return weeks.sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
}

/** The cards of a week, in the order of the batch. */
export const cardsOfWeek = (groups: readonly ReviewGroup[], week: FlowWeek): ReviewCard[] => groups.find((group) => group.batchId === week.batchId)?.cards.filter((card) => week.postIds.includes(card.postId)) ?? [];

/** The week to open first: the first one with something to decide or approve, else the first. */
export function firstOpenWeek(groups: readonly ReviewGroup[], weeks: readonly FlowWeek[]): string | null {
  const open = weeks.find((week) => cardsOfWeek(groups, week).some((card) => card.written?.state === "pending" || card.pictures.some((poster) => poster.status === "pending" || poster.status === "held")));
  return (open ?? weeks[0])?.key ?? null;
}

/** Whether the pictures of this week are asked for, so its choices are final. A kept topic that got no picture stays open. */
export const weekAsked = (week: FlowWeek): boolean => week.state === "drawing" || week.state === "drawn";

/**
 * Whether a topic's choice, words and day are final: the posting service says so per post; for one that does not (an older answer), the
 * whole week is final once its pictures were asked for, except a kept topic that got no picture.
 */
export const postFinal = (card: ReviewCard, week: FlowWeek): boolean => card.written?.locked ?? (weekAsked(week) && card.written?.notDrawn == null);

/** The pictures of one channel among a week's cards. */
export const picturesOn = (cards: readonly ReviewCard[], channel: ChannelPlatform): Poster[] => cards.flatMap((card) => card.pictures.filter((poster) => poster.network === channel));

/** What a channel has left to do in a week, for its row in the sidebar: topics to decide while the week is open, pictures to approve once it is drawn. */
export function channelTodo(cards: readonly ReviewCard[], week: FlowWeek | undefined, channel: ChannelPlatform): { readonly count: number; readonly words: string } {
  if (week === undefined) return { count: 0, words: "Nothing yet" };
  if (week.state === "partly_drawn") {
    const topics = cards.filter((card) => card.written?.state === "pending" && !postFinal(card, week)).length;
    const pictures = picturesOn(cards, channel).filter((poster) => poster.status === "pending" || poster.status === "held").length;
    const words = topics > 0 && pictures > 0 ? `${topics} to decide, ${pictures} to approve` : topics > 0 ? `${topics} to decide` : pictures > 0 ? `${pictures} to approve` : "Decided";
    return { count: topics + pictures, words };
  }
  if (!weekAsked(week)) {
    const count = cards.filter((card) => card.written?.state === "pending").length;
    return { count, words: count === 0 ? "Decided" : `${count} to decide` };
  }
  const pictures = picturesOn(cards, channel);
  if (pictures.length === 0) return { count: 0, words: week.state === "drawing" ? "Drawing" : "No pictures" };
  const count = pictures.filter((poster) => poster.status === "pending" || poster.status === "held").length;
  return { count, words: count === 0 ? "All approved" : `${count} to approve` };
}

/** Where the new topic for a dropped post stands, as the screen shows it. */
export type ReplaceState = "writing" | "failed";

/**
 * The dropped posts that have a new topic being written, or whose last try wrote nothing, from the jobs (newest first). A job that finished
 * is not listed: its new post is in the batch by then.
 */
export function replaceStates(jobs: readonly { readonly kind: string; readonly state: string; readonly postId?: string | undefined }[]): Record<string, ReplaceState> {
  const states: Record<string, ReplaceState> = {};
  const seen = new Set<string>();
  for (const job of jobs) {
    if (job.kind !== "replace" || job.postId === undefined || seen.has(job.postId)) continue;
    seen.add(job.postId);
    if (job.state === "queued" || job.state === "running") states[job.postId] = "writing";
    else if (job.state === "failed") states[job.postId] = "failed";
  }
  return states;
}
