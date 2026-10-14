import "server-only";
import { consumeRateLimit, editOwnerReply, postOwnerReply, removeOwnerReply, type RateLimitRule } from "@firstfold/db";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { parseOwnerReplyText } from "@/lib/owner-replies";
import { getStaffDb } from "./db";
import type { OwnedBusiness } from "./owner-business";
import { scheduleWebsiteRefresh } from "./website-refresh";

/**
 * A verified owner answering their business's reviews: posting an answer, changing it, taking it down. The caller has
 * already proved who they are and which business is theirs (getOwnedDirectoryBusiness); every write here is held to
 * that business, so an id from another business is simply "not found", the same as one that does not exist. Runs on the
 * staff connection: the directory's tables are staff-only (see `getStaffDb` in ./db.ts).
 */

type Owner = Extract<OwnedBusiness, { readonly kind: "owner" }>;

const ONE_HOUR_SECONDS = 60 * 60;
/** A person answering reviews is nowhere near this; a script is stopped here. */
const POST_HOURLY_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };
const CHANGE_HOURLY_RULE: RateLimitRule = { limit: 60, windowSeconds: ONE_HOUR_SECONDS };

export interface SavedOwnerReply {
  readonly id: string;
  readonly text: string;
  /** ISO 8601. */
  readonly createdAt: string;
  readonly edited: boolean;
}

export type OwnerReplyOutcome =
  | { readonly kind: "saved"; readonly reply: SavedOwnerReply }
  | { readonly kind: "removed" }
  | { readonly kind: "invalid"; readonly message: string }
  /** The review or answer is gone, hidden, or is not this business's. */
  | { readonly kind: "not_found" }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** Answers a published review of the owner's business. */
export async function postReply(owner: Owner, input: { readonly reviewId: string; readonly text: string }, now: Date): Promise<OwnerReplyOutcome> {
  const text = parseOwnerReplyText(input.text);
  if (!text.ok) return { kind: "invalid", message: text.message };
  try {
    const db = getStaffDb();
    const allowed = await consumeRateLimit(db, `dir-owner-reply:post:${owner.user.id}`, POST_HOURLY_RULE, now);
    if (!allowed.allowed) return { kind: "limited" };
    const posted = await postOwnerReply(db, {
      business: owner.business,
      reviewId: input.reviewId,
      owner: { userId: owner.user.id, name: owner.user.name },
      text: text.text,
      now,
    });
    if (posted === null) return { kind: "not_found" };
    scheduleWebsiteRefresh(owner.business);
    return { kind: "saved", reply: { id: posted.commentId, text: text.text, createdAt: now.toISOString(), edited: false } };
  } catch (error) {
    console.error("Could not post an owner's reply to a directory review.", { reviewId: input.reviewId, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}

/** Changes the words of one of the owner's own answers. */
export async function changeReply(owner: Owner, input: { readonly commentId: string; readonly text: string }, now: Date): Promise<OwnerReplyOutcome> {
  const text = parseOwnerReplyText(input.text);
  if (!text.ok) return { kind: "invalid", message: text.message };
  try {
    const db = getStaffDb();
    const allowed = await consumeRateLimit(db, `dir-owner-reply:change:${owner.user.id}`, CHANGE_HOURLY_RULE, now);
    if (!allowed.allowed) return { kind: "limited" };
    const postedAt = await editOwnerReply(db, { business: owner.business, commentId: input.commentId, text: text.text, now });
    if (postedAt === null) return { kind: "not_found" };
    scheduleWebsiteRefresh(owner.business);
    // The answer keeps its place in the conversation: its posting time is the first one.
    return { kind: "saved", reply: { id: input.commentId, text: text.text, createdAt: postedAt.toISOString(), edited: true } };
  } catch (error) {
    console.error("Could not edit an owner's reply to a directory review.", { commentId: input.commentId, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}

/** Takes one of the owner's own answers down (hides it: staff can still see it). */
export async function takeDownReply(owner: Owner, input: { readonly commentId: string }, now: Date): Promise<OwnerReplyOutcome> {
  try {
    const db = getStaffDb();
    const allowed = await consumeRateLimit(db, `dir-owner-reply:change:${owner.user.id}`, CHANGE_HOURLY_RULE, now);
    if (!allowed.allowed) return { kind: "limited" };
    const removed = await removeOwnerReply(db, { business: owner.business, commentId: input.commentId, ownerUserId: owner.user.id, now });
    if (!removed) return { kind: "not_found" };
    scheduleWebsiteRefresh(owner.business);
    return { kind: "removed" };
  } catch (error) {
    console.error("Could not take down an owner's reply to a directory review.", { commentId: input.commentId, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}
