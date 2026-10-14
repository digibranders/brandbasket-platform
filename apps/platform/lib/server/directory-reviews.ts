import "server-only";
import { randomUUID } from "node:crypto";
import {
  answerByAsked,
  claimDirectoryReviewOtpAttempt,
  consumeRateLimit,
  createDirectoryReviewOtp,
  directoryLookupOf,
  directoryRefId,
  deleteDirectoryReviewOtp,
  findDirectoryReviewOtp,
  listPublishedDirectoryReviews,
  publishDirectoryReviewFromOtp,
  readDirectoryRatings,
  readDirectoryReviewComments,
  resolveDirectoryAsk,
  resolveDirectoryNamed,
  resolveDirectoryNamedForRead,
  type DirectoryAsk,
  type DirectoryNamed,
  type DirectoryRatingSummary,
  type DirectoryReviewOtpPayload,
  type RateLimitRule,
} from "@fynix/db";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import {
  REVIEW_HIGHLIGHTS,
  REVIEWS_PAGE_SIZE,
  type DirectoryFormField,
  type RatingSummary,
  type RatingsResponse,
  type ReviewHighlightId,
  type ReviewsResponse,
} from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { startVisitorSession, type ResolvedVisitor, type VisitorSession } from "./directory-visitor";
import { recordContributionConsent } from "./visitor-consent";
import type { ReviewInput } from "./directory-fields";
import { accountCodeSecret } from "./env";
import { errorLogInfo, type SafeErrorLog } from "@fynix/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";
import { otpCodeMatches } from "./otp-crypto";

/**
 * The work behind the local directory's ratings and reviews routes (/api/directory/ratings, /reviews, /reviews/otp,
 * /reviews/confirm), called by the marketing website's server. Runs on the staff connection (see the sanctioned
 * exceptions on `getStaffDb` in ./db.ts): the directory tables are staff-only, and the website's shared secret has
 * already been checked by the route.
 *
 * A review used to be confirmed by a code sent to the reviewer's phone. Fynix sends nothing to phones and the directory is
 * closed, so a code can no longer be asked for (`requestReviewOtp`); a recognised visitor's review (`publishReviewAsVisitor`) and
 * the confirmation of a code already held (`confirmReviewOtp`, 6 digits, 10 minutes, 5 attempts, HMAC with the account code
 * secret) are left as they were.
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Per business: a sudden run of codes for one listing is a pile-on, not customers. */
const LISTING_DAY_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_DAY_SECONDS };
/** Confirm attempts per visitor address, only to slow code guessing (each code also has its own 5 tries). */
const CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Ask for a new code.";
const NO_TRIES_LEFT_MESSAGE = "No tries left. Ask for a new code.";

export type ReviewOtpOutcome =
  | { readonly kind: "otp_sent"; readonly otpId: string; readonly expiresInSeconds: number; readonly phoneHint: string }
  /** A recognised visitor: published at once, with no code. */
  | { readonly kind: "published"; readonly visitor: VisitorSession }
  /** The visitor token is no good any more. */
  | { readonly kind: "signed_out" }
  | { readonly kind: "invalid"; readonly field: DirectoryFormField; readonly message: string }
  /** The id names no business on the platform. */
  | { readonly kind: "unknown_business" }
  | { readonly kind: "limited" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

export type ReviewConfirmOutcome =
  /** `visitor` is the account the confirmed number now has; absent if it could not be opened. */
  | { readonly kind: "published"; readonly visitor?: VisitorSession }
  | { readonly kind: "expired" }
  | { readonly kind: "too_many_attempts"; readonly message: string }
  | { readonly kind: "wrong_code"; readonly message: string }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** The id or key a request named its business by: public data, safe to log. */
function businessLabel(business: DirectoryNamed): string {
  return business.by === "id" ? business.id : business.key;
}

/** What is safe to log about a failure here: the business (public data) and the error's class and Postgres code, never
 * its message, which can carry the reviewer's name or phone from a failed query's parameters. */
function loggable(business: DirectoryNamed | null, error: unknown): SafeErrorLog & { readonly business: string | null } {
  return { business: business === null ? null : businessLabel(business), ...errorLogInfo(error) };
}

/**
 * Asks for a code to publish a review. Always `unavailable`: the code went to the reviewer's phone, Fynix sends nothing to
 * phones, and the directory pages are closed, so there is no way to prove a number. A client that still asks gets the answer
 * it already handles for a deployment that cannot send codes.
 */
export async function requestReviewOtp(): Promise<ReviewOtpOutcome> {
  return { kind: "unavailable" };
}

/** Per visitor address and per phone for a recognised visitor's reviews: the code limits, under keys of their own so
 * a visitor's reviews never use up the budget of codes. */
const VISITOR_IP_RULE: RateLimitRule = { limit: 20, windowSeconds: ONE_HOUR_SECONDS };
const VISITOR_PHONE_DAY_RULE: RateLimitRule = { limit: 20, windowSeconds: ONE_DAY_SECONDS };

/**
 * Publishes `input` for a recognised visitor, whose number a code proved earlier: no code is asked for or sent. It goes
 * through exactly the path a confirmed code does (the held review is created, its one attempt claimed and published), so
 * a second review from the number still replaces the first. Same rate limits as asking for a code, narrowest first.
 */
export async function publishReviewAsVisitor(input: ReviewInput, visitor: ResolvedVisitor, clientIp: string, now: Date): Promise<ReviewOtpOutcome> {
  try {
    const db = getStaffDb();
    const business = await resolveDirectoryNamed(db, input.business);
    if (business === null) return { kind: "unknown_business" };

    for (const check of [
      { key: `dir-review-visitor:ip:${ipRateLimitKey(clientIp)}`, rule: VISITOR_IP_RULE },
      { key: `dir-review-visitor:phone:day:${input.phone}`, rule: VISITOR_PHONE_DAY_RULE },
      { key: `dir-review-otp:listing:day:${directoryRefId(business)}`, rule: LISTING_DAY_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule, now);
      if (!result.allowed) return { kind: "limited" };
    }

    const otpId = randomUUID();
    const payload: DirectoryReviewOtpPayload = {
      businessName: input.businessName,
      reviewerName: input.name,
      rating: input.rating,
      text: input.text,
      highlights: input.highlights,
      ownerContact: input.ownerContact,
      ...(input.consent === undefined ? {} : { consent: input.consent }),
    };
    // No code was ever made: the hash is a value no code can match, and the row is used up in the next two lines.
    await createDirectoryReviewOtp(db, {
      id: otpId,
      business,
      phone: input.phone,
      codeHash: "visitor-account",
      payload,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });
    await claimDirectoryReviewOtpAttempt(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    const published = await publishDirectoryReviewFromOtp(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (published === null) {
      await deleteDirectoryReviewOtp(db, otpId);
      return { kind: "failed" };
    }
    await recordContributionConsent(db, visitor.id, input.consent);
    return { kind: "published", visitor: visitor.session };
  } catch (error) {
    console.error("Could not publish a recognised visitor's review.", loggable(input.business, error));
    return { kind: "failed" };
  }
}

/** "1 try left" / "2 tries left". */
function wrongCodeMessage(triesLeft: number): string {
  return `That code isn't right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/**
 * Confirms a review code and publishes its review. Rate limits by address, loads the code (a missing, used or
 * expired one reads as expired), claims one of its attempts before comparing -- so racing confirms can never both
 * spend the last try -- then verifies it and publishes the review in one transaction
 * (publishDirectoryReviewFromOtp). A second review from the same phone replaces that phone's earlier one.
 */
export async function confirmReviewOtp(otpId: string, code: string, clientIp: string, now: Date): Promise<ReviewConfirmOutcome> {
  try {
    const secret = accountCodeSecret();
    const db = getStaffDb();

    const rateLimit = await consumeRateLimit(db, `dir-review-confirm:ip:${ipRateLimitKey(clientIp)}`, CONFIRM_IP_RULE, now);
    if (!rateLimit.allowed) return { kind: "limited" };

    const otp = await findDirectoryReviewOtp(db, otpId);
    // A comment's code (it names a review) is not a review's: it only confirms at the comment route.
    if (otp === null || otp.reviewId !== null || otp.verifiedAt !== null || otp.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
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

    const published = await publishDirectoryReviewFromOtp(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    // Null only when another confirm used the code, or it expired, between the claim and here.
    if (published === null) return { kind: "expired" };
    // The number is proven: open its account (or find it) so the visitor is not asked for a code again.
    const visitor = await startVisitorSession(otp.phone, otp.payload.reviewerName, now, otp.payload.consent);
    return visitor === undefined ? { kind: "published" } : { kind: "published", visitor };
  } catch (error) {
    console.error("Could not confirm a directory review code.", loggable(null, error));
    return { kind: "failed" };
  }
}

const HIGHLIGHT_LABELS: ReadonlyMap<ReviewHighlightId, string> = new Map(
  REVIEW_HIGHLIGHTS.map((highlight) => [highlight.id, highlight.label]),
);

function highlightOf(id: ReviewHighlightId): { readonly id: ReviewHighlightId; readonly label: string } {
  return { id, label: HIGHLIGHT_LABELS.get(id) ?? id };
}

function toRatingSummary(summary: DirectoryRatingSummary): RatingSummary {
  return {
    average: summary.average,
    count: summary.count,
    topHighlight: summary.topHighlight === null ? null : { ...highlightOf(summary.topHighlight.id), count: summary.topHighlight.count },
  };
}

/** The rating summary of each business asked about that has published reviews, keyed by the id or key it was asked
 * by; those with none are left out. A place is read once however many of its keys and its id were asked. At most
 * MAX_RATING_KEYS together: the route checks that before calling. */
export async function readRatings(ask: DirectoryAsk): Promise<RatingsResponse> {
  const db = getStaffDb();
  const resolved = await resolveDirectoryAsk(db, ask);
  const summaries = await readDirectoryRatings(db, resolved.lookup);
  const ratings: Record<string, RatingSummary> = {};
  for (const [asked, summary] of answerByAsked(resolved, summaries)) ratings[asked] = toRatingSummary(summary);
  return { ratings };
}

/** One page of a business's published reviews (every address of its place together), newest first, with its rating
 * summary, each review's Helpful count and its latest comments. */
export async function readReviews(named: DirectoryNamed, page: number): Promise<ReviewsResponse> {
  const db = getStaffDb();
  const business = await resolveDirectoryNamedForRead(db, named);
  const [summaries, reviewPage] = await Promise.all([
    readDirectoryRatings(db, directoryLookupOf([business])),
    listPublishedDirectoryReviews(db, { business, page, pageSize: REVIEWS_PAGE_SIZE }),
  ]);
  const comments = await readDirectoryReviewComments(
    db,
    reviewPage.reviews.map((review) => review.id),
  );
  const summary = summaries.get(directoryRefId(business));
  return {
    summary: summary === undefined ? null : toRatingSummary(summary),
    reviews: reviewPage.reviews.map((review) => {
      const thread = comments.get(review.id);
      return {
        id: review.id,
        name: review.displayName,
        rating: review.rating,
        text: review.text,
        highlights: review.highlights.map(highlightOf),
        createdAt: review.createdAt.toISOString(),
        helpful: review.helpfulCount,
        commentCount: thread?.total ?? 0,
        comments: (thread?.comments ?? []).map((comment) => ({
          id: comment.id,
          name: comment.displayName,
          text: comment.text,
          createdAt: comment.createdAt.toISOString(),
          // Only said when true, so a visitor's comment reads exactly as it did before owners could answer.
          ...(comment.byOwner ? { byOwner: true } : {}),
          ...(comment.edited ? { edited: true } : {}),
        })),
      };
    }),
    page,
    pageCount: Math.max(1, Math.ceil(reviewPage.total / REVIEWS_PAGE_SIZE)),
  };
}
