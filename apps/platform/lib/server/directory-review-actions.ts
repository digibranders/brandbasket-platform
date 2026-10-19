import "server-only";
import { randomUUID } from "node:crypto";
import {
  claimDirectoryReviewOtpAttempt,
  consumeRateLimit,
  createDirectoryCommentOtp,
  deleteDirectoryReviewOtp,
  findDirectoryReviewOtp,
  findPublishedDirectoryReviewForComment,
  incrementDirectoryReviewHelpful,
  publishDirectoryCommentFromOtp,
  readDirectoryReviewHelpful,
  type DirectoryCommentOtpPayload,
  type RateLimitRule,
} from "@brandbasket/db";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@brandbasket/shared/lib/appointments/otp";
import { getStaffDb } from "./db";
import { startVisitorSession, type ResolvedVisitor } from "./directory-visitor";
import { recordContributionConsent } from "./visitor-consent";
import type { CommentInput } from "./directory-fields";
import { visitorHash } from "./directory-signals";
import type { ReviewConfirmOutcome, ReviewOtpOutcome } from "./directory-reviews";
import { accountCodeSecret } from "./env";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";
import { otpCodeMatches } from "./otp-crypto";

/**
 * The work behind the local directory's review actions (/api/directory/reviews/helpful and /comments/*), called by the
 * marketing website's server. Runs on the staff connection (see the sanctioned exceptions on `getStaffDb` in ./db.ts):
 * the directory tables are staff-only, and the website's shared secret has already been checked by the route.
 *
 * Helpful: a visitor marks a published review once a week. Who they are is never stored: the only trace is a rate-limit
 * bucket keyed by an HMAC of their address and the review, which expires by itself, and the review's own count.
 *
 * A comment used to be confirmed by a code sent to the commenter's phone. Brandbasket sends nothing to phones and the directory
 * is closed, so a code can no longer be asked for (`requestCommentOtp`); a recognised visitor's comment
 * (`publishCommentAsVisitor`) and the confirmation of a code already held (`confirmCommentOtp`, 6 digits, 10 minutes, 5
 * attempts, HMAC with the account code secret) are left as they were.
 */

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** One Helpful per visitor and review a week: a rate-limit bucket under a hashed key, not a row about the visitor. */
export const HELPFUL_ONCE_A_WEEK_RULE: RateLimitRule = { limit: 1, windowSeconds: 7 * ONE_DAY_SECONDS };
/** Every Helpful from one address, whatever the review: far above a person reading, well below a bot's crawl. */
export const HELPFUL_IP_HOURLY_RULE: RateLimitRule = { limit: 60, windowSeconds: ONE_HOUR_SECONDS };

/** Per review: a sudden run of comments for one review is a pile-on, not conversation. */
const COMMENT_REVIEW_DAY_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_DAY_SECONDS };
/** Confirm attempts per visitor address, only to slow code guessing (each code also has its own 5 tries). */
const COMMENT_CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

/** A recognised visitor's comments: per address and per phone, under keys apart from the codes' budget. */
const COMMENT_VISITOR_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };
const COMMENT_VISITOR_PHONE_DAY_RULE: RateLimitRule = { limit: 40, windowSeconds: ONE_DAY_SECONDS };

const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Ask for a new code.";
const NO_TRIES_LEFT_MESSAGE = "No tries left. Ask for a new code.";

/** `unknown_review`: the id names no published review (hidden since the page was drawn, or never one). */
export type ReviewHelpfulOutcome =
  | { readonly kind: "counted"; readonly helpful: number }
  | { readonly kind: "unknown_review" }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

export type CommentOtpOutcome =
  | Exclude<ReviewOtpOutcome, { readonly kind: "unknown_business" }>
  | { readonly kind: "unknown_review" };

/**
 * Marks a published review Helpful for this visitor. The first time in a week counts; a repeat answers with the count
 * as it stands, so the page can show it either way. Over the per-address ceiling (a bot) is `limited`.
 */
export async function markReviewHelpful(reviewId: string, clientIp: string, now: Date): Promise<ReviewHelpfulOutcome> {
  try {
    const secret = accountCodeSecret();
    const db = getStaffDb();
    const visitor = ipRateLimitKey(clientIp);

    const ceiling = await consumeRateLimit(db, `dir-helpful:ip:${visitorHash(secret, [visitor])}`, HELPFUL_IP_HOURLY_RULE, now);
    if (!ceiling.allowed) return { kind: "limited" };

    const once = await consumeRateLimit(db, `dir-helpful:once:${visitorHash(secret, [visitor, reviewId])}`, HELPFUL_ONCE_A_WEEK_RULE, now);
    const helpful = once.allowed ? await incrementDirectoryReviewHelpful(db, reviewId) : await readDirectoryReviewHelpful(db, reviewId);
    return helpful === null ? { kind: "unknown_review" } : { kind: "counted", helpful };
  } catch (error) {
    // The review id is a random UUID, not personal; the visitor's address is never logged.
    console.error("Could not count a directory review as helpful.", { reviewId, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}

/**
 * Asks for a code to publish a comment. Always `unavailable`: the code went to the commenter's phone, Brandbasket sends nothing to
 * phones, and the directory pages are closed, so there is no way to prove a number. A client that still asks gets the answer
 * it already handles for a deployment that cannot send codes.
 */
export async function requestCommentOtp(): Promise<CommentOtpOutcome> {
  return { kind: "unavailable" };
}

/**
 * Publishes `input` for a recognised visitor, whose number a code proved earlier: no code is asked for. Same
 * path as a confirmed code (the held comment is created, its attempt claimed and published) and the same limits as
 * asking for one, under keys of their own.
 */
export async function publishCommentAsVisitor(input: CommentInput, visitor: ResolvedVisitor, clientIp: string, now: Date): Promise<CommentOtpOutcome> {
  try {
    const db = getStaffDb();
    const review = await findPublishedDirectoryReviewForComment(db, input.reviewId);
    if (review === null) return { kind: "unknown_review" };

    for (const check of [
      { key: `dir-comment-visitor:ip:${ipRateLimitKey(clientIp)}`, rule: COMMENT_VISITOR_IP_RULE },
      { key: `dir-comment-visitor:phone:day:${input.phone}`, rule: COMMENT_VISITOR_PHONE_DAY_RULE },
      { key: `dir-comment-otp:review:day:${review.id}`, rule: COMMENT_REVIEW_DAY_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule, now);
      if (!result.allowed) return { kind: "limited" };
    }

    const otpId = randomUUID();
    const payload: DirectoryCommentOtpPayload = { commenterName: input.name, text: input.text, ...(input.consent === undefined ? {} : { consent: input.consent }) };
    await createDirectoryCommentOtp(db, {
      id: otpId,
      review,
      phone: input.phone,
      codeHash: "visitor-account",
      payload,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });
    await claimDirectoryReviewOtpAttempt(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    const published = await publishDirectoryCommentFromOtp(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (published === null) {
      await deleteDirectoryReviewOtp(db, otpId);
      return { kind: "unknown_review" };
    }
    await recordContributionConsent(db, visitor.id, input.consent);
    return { kind: "published", visitor: visitor.session };
  } catch (error) {
    console.error("Could not publish a recognised visitor's comment.", { reviewId: input.reviewId, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}

/** "1 try left" / "2 tries left". */
function wrongCodeMessage(triesLeft: number): string {
  return `That code isn't right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/**
 * Confirms a comment code and publishes its comment. Rate limits by address, loads the code (a missing, used,
 * expired or review's code reads as expired), claims one of its attempts before comparing -- so racing confirms can
 * never both spend the last try -- then verifies it and publishes the comment in one transaction
 * (publishDirectoryCommentFromOtp).
 */
export async function confirmCommentOtp(otpId: string, code: string, clientIp: string, now: Date): Promise<ReviewConfirmOutcome> {
  try {
    const secret = accountCodeSecret();
    const db = getStaffDb();

    const rateLimit = await consumeRateLimit(db, `dir-comment-confirm:ip:${ipRateLimitKey(clientIp)}`, COMMENT_CONFIRM_IP_RULE, now);
    if (!rateLimit.allowed) return { kind: "limited" };

    const otp = await findDirectoryReviewOtp(db, otpId);
    if (otp === null || otp.reviewId === null || otp.verifiedAt !== null || otp.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };

    const claim = await claimDirectoryReviewOtpAttempt(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (claim === null) {
      // Lost a race since the read above: tell an expiry from an attempt ceiling reached meanwhile.
      const fresh = await findDirectoryReviewOtp(db, otpId);
      if (fresh === null || fresh.verifiedAt !== null || fresh.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
      return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };
    }

    const matches = otpCodeMatches(otp.codeHash, otp.id, code, secret);
    if (!matches) {
      const triesLeft = Math.max(OTP_MAX_ATTEMPTS - claim.attempts, 0);
      if (triesLeft === 0) return { kind: "too_many_attempts", message: NO_TRIES_LEFT_MESSAGE };
      return { kind: "wrong_code", message: wrongCodeMessage(triesLeft) };
    }

    const published = await publishDirectoryCommentFromOtp(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    // Null when another confirm used the code, it expired, or the review was hidden, between the claim and here.
    if (published === null) return { kind: "expired" };
    const commenter = "commenterName" in otp.payload ? String(otp.payload.commenterName) : "";
    const visitor = commenter === "" ? undefined : await startVisitorSession(otp.phone, commenter, now, otp.payload.consent);
    return visitor === undefined ? { kind: "published" } : { kind: "published", visitor };
  } catch (error) {
    console.error("Could not confirm a directory comment code.", errorLogInfo(error));
    return { kind: "failed" };
  }
}
