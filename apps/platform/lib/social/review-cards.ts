import { CHANNEL_PLATFORMS } from "./auto";
import type { Poster, WrittenBatch, WrittenPost } from "./ai";

/** One post idea on the review page: its written words (until its pictures are drawn) and the pictures drawn for it. */
export interface ReviewCard {
  readonly key: string;
  readonly batchId: string;
  readonly postId: string;
  readonly headline: string;
  /** The written post, while its batch is still listed; null once the batch is drawn and only its pictures are left. */
  readonly written: WrittenPost | null;
  /** One entry for each picture of the post, in the order the networks are listed. */
  readonly pictures: readonly Poster[];
}

/** The cards of one batch, with the batch's written words when it is still listed. */
export interface ReviewGroup {
  readonly batchId: string;
  readonly batch: WrittenBatch | null;
  readonly cards: readonly ReviewCard[];
}

const networkOrder = (poster: Poster): number => CHANNEL_PLATFORMS.indexOf(poster.network);

/**
 * Puts each written post and the pictures drawn for it on one card, batch by batch: a post that is still being decided shows its
 * words, and once its pictures exist they sit on the same card. A batch whose posts are no longer listed (it was drawn) still
 * shows its pictures, under the headline they carry. Batches that are listed come first, in the order given.
 */
export function groupReview(batches: readonly WrittenBatch[], pictures: readonly Poster[]): ReviewGroup[] {
  const byPost = new Map<string, Poster[]>();
  for (const poster of pictures) {
    const key = `${poster.batchId}/${poster.postId}`;
    byPost.set(key, [...(byPost.get(key) ?? []), poster]);
  }
  const used = new Set<string>();
  const take = (batchId: string, postId: string): Poster[] => {
    const key = `${batchId}/${postId}`;
    used.add(key);
    return [...(byPost.get(key) ?? [])].sort((a, b) => networkOrder(a) - networkOrder(b) || a.createdAt.localeCompare(b.createdAt));
  };
  const groups: ReviewGroup[] = batches.map((batch) => ({
    batchId: batch.id,
    batch,
    cards: batch.posts.map((post) => ({ key: `${batch.id}/${post.id}`, batchId: batch.id, postId: post.id, headline: post.headline, written: post, pictures: take(batch.id, post.id) })),
  }));
  const rest = new Map<string, ReviewCard[]>();
  for (const [key, posters] of byPost) {
    if (used.has(key)) continue;
    const first = posters[0];
    if (first === undefined) continue;
    const card: ReviewCard = { key, batchId: first.batchId, postId: first.postId, headline: first.headline, written: null, pictures: take(first.batchId, first.postId) };
    rest.set(first.batchId, [...(rest.get(first.batchId) ?? []), card]);
  }
  for (const [batchId, cards] of rest) {
    const into = groups.findIndex((group) => group.batchId === batchId);
    if (into >= 0) groups[into] = { ...(groups[into] as ReviewGroup), cards: [...(groups[into] as ReviewGroup).cards, ...cards] };
    else groups.push({ batchId, batch: null, cards });
  }
  return groups;
}
