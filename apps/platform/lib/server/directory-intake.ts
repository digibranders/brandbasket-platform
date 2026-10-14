import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { DirectoryAsk, DirectoryNamed } from "@fynix/db";
import { OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import { isPictureCopyWidth, type PictureCopyWidth } from "@fynix/shared/server/media-keys";
import {
  adMarketSchema,
  commentOtpRequestSchema,
  directoryAdEventRequestSchema,
  directoryEventRequestSchema,
  enquiryRequestSchema,
  listingKeySchema,
  MAX_RATING_KEYS,
  placeIdSchema,
  reviewConfirmRequestSchema,
  reviewHelpfulRequestSchema,
  reviewOtpRequestSchema,
  type AdsResponse,
  type DirectoryError,
  type directoryEventResponseSchema,
  type EnquiryResponse,
  type GalleryResponse,
  type RatingsResponse,
  type ReviewConfirmResponse,
  type ReviewHelpfulResponse,
  type ReviewOtpResponse,
  type ReviewsResponse,
  type SignalsResponse,
  type StatusResponse,
} from "@/lib/directory-api";
import {
  parseCommentFields,
  parseEnquiryFields,
  parseReviewFields,
  UNKNOWN_BUSINESS_MESSAGE,
  type CommentInput,
  type EnquiryInput,
  type ReviewInput,
} from "./directory-fields";
import type { EnquiryOutcome } from "./directory-enquiries";
import type { ResolvedVisitor, VisitorSession } from "./directory-visitor";
import type { CommentOtpOutcome, ReviewHelpfulOutcome } from "./directory-review-actions";
import type { ReviewConfirmOutcome, ReviewOtpOutcome } from "./directory-reviews";
import type { DirectoryAdEvent, DirectoryAdEventOutcome } from "./directory-ad-events";
import type { DirectoryEvent, DirectoryEventOutcome } from "./directory-signals";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import { hasValidWebsiteToken } from "./website-api-auth";

/**
 * The HTTP side of the local directory's routes (/api/directory/*), called server-to-server by the marketing
 * website with `Authorization: Bearer <LEADS_API_TOKEN>` (lib/directory-api.ts is the contract). Everything here is
 * request checking and outcome-to-status mapping; the work itself is injected, so it is tested without a database.
 *
 * Every route checks, in order:
 * 1. the method, or 405
 * 2. a configured token, or 503, and a matching bearer header, or 401
 * The POST routes then check a JSON content type (415), a body within the size limit (413), the contract's shape
 * (400), the honeypot (a filled one gets a convincing success and nothing happens) and the visitor's own input (422
 * with the field to point at).
 *
 * Businesses are named by their permanent ids (`ids`, `id`) or, until the website has switched, their listing keys
 * (`keys`, `key`); a malformed id or key is a 400 like any other malformed request, and every answer is keyed by what
 * was asked (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md, Task 7).
 */

/** A review or enquiry: nine short fields of at most 2,000 characters each fit well inside this. */
const MAX_FORM_BODY_BYTES = 16 * 1024;
/** {otpId, code, clientIp}. */
const MAX_CONFIRM_BODY_BYTES = 4 * 1024;
/** {reviewId, clientIp}. */
const MAX_HELPFUL_BODY_BYTES = 2 * 1024;
/** {key or id, kind, clientIp}: a 200-character key and a 64-character address fit many times over. */
const MAX_EVENT_BODY_BYTES = 2 * 1024;
/** Pages beyond this are not real traffic; the cap keeps the offset query cheap. */
const MAX_REVIEWS_PAGE = 10_000;

/** Ratings, verified statuses and signals: a list page asks for each on every render, and a minute's delay is fine for
 * all of them. */
const LIST_CACHE_CONTROL = "public, s-maxage=60";

const LIMITED_MESSAGE = "You've sent a few of these already. Please try again later.";
const FAILED_MESSAGE = "Something went wrong. Please try again in a moment.";
const UNAVAILABLE_MESSAGE = "We can't send codes right now. Please try again later.";
const SIGNED_OUT_MESSAGE = "You've been signed out. Enter your name and number again.";

/** Looks up the visitor a request's token names. */
type ResolveVisitor = (token: string, now: Date) => Promise<ResolvedVisitor | null>;

/** Who a request is from: nobody in particular, a recognised visitor, or a visitor whose token is no good any more. */
type VisitorGate =
  | { readonly kind: "anonymous" }
  | { readonly kind: "visitor"; readonly visitor: ResolvedVisitor }
  | { readonly kind: "signed_out" };

async function gateVisitor(token: string | undefined, resolve: ResolveVisitor, now: Date): Promise<VisitorGate> {
  if (token === undefined) return { kind: "anonymous" };
  const visitor = await resolve(token, now);
  return visitor === null ? { kind: "signed_out" } : { kind: "visitor", visitor };
}
const EXPIRED_MESSAGE = "That code has expired. Please ask for a new one.";
/** For a review that is no longer published: the page is behind, or staff took the review down. */
const UNKNOWN_REVIEW_MESSAGE = "We couldn't find this review. Refresh the page and try again.";

type ErrorBody = { readonly error: string };

function reply(status: number, body: object, cacheControl = "no-store"): Response {
  return Response.json(body, { status, headers: { "Cache-Control": cacheControl } });
}

function directoryError(status: number, code: DirectoryError["code"], message: string, field: DirectoryError["field"] = null): Response {
  const body: DirectoryError = { status: "error", code, message, field };
  return reply(status, body);
}

/** The method and token checks every directory route starts with, or null when the request may go on. */
function refuseUnauthorised(request: Request, method: "GET" | "POST", token: string | null): Response | null {
  if (request.method !== method) return reply(405, { error: "Method not allowed." } satisfies ErrorBody);
  if (token === null) {
    console.error("LEADS_API_TOKEN is not set, so the website cannot reach the directory.");
    return reply(503, { error: "The directory is not available right now." } satisfies ErrorBody);
  }
  if (!hasValidWebsiteToken(request, token)) return reply(401, { error: "Not authorised." } satisfies ErrorBody);
  return null;
}

type JsonBody = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly response: Response };

async function readJsonBody(request: Request, limit: number): Promise<JsonBody> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: reply(415, { error: "Send JSON." } satisfies ErrorBody) };
  }
  try {
    const bytes = await readLimitedBody(request.body, limit);
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, response: reply(413, { error: "Request too large." } satisfies ErrorBody) };
    return { ok: false, response: reply(400, { error: "The body is not valid JSON." } satisfies ErrorBody) };
  }
}

function isHoneypotFilled(website: string): boolean {
  return website.trim() !== "";
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/ratings?keys=k1,k2 or ?ids=i1,i2
// ---------------------------------------------------------------------------------------------------------------

export interface RatingsIntakeDeps {
  readonly token: string | null;
  readonly readRatings: (ask: DirectoryAsk) => Promise<RatingsResponse>;
}

/** The distinct, non-blank entries of a comma-separated list, or null when the parameter is absent. */
function commaList(raw: string | null): readonly string[] | null {
  if (raw === null) return null;
  return [...new Set(raw.split(",").map((entry) => entry.trim()).filter((entry) => entry !== ""))];
}

const BUSINESSES_REFUSAL = `Name 1 to ${MAX_RATING_KEYS} businesses by ids or keys, comma-separated.`;

/**
 * The businesses a ratings, status or signals request names: `ids` (permanent ids) and, during the switch, `keys`
 * (listing keys), each comma-separated. Null when neither names anything, either holds anything malformed, a list is
 * given but empty, or together they name more than MAX_RATING_KEYS.
 */
export function parseDirectoryAsk(params: URLSearchParams): DirectoryAsk | null {
  const ids = commaList(params.get("ids"));
  const keys = commaList(params.get("keys"));
  if (ids === null && keys === null) return null;
  if ((ids !== null && ids.length === 0) || (keys !== null && keys.length === 0)) return null;
  const ask: DirectoryAsk = { ids: ids ?? [], keys: keys ?? [] };
  const count = ask.ids.length + ask.keys.length;
  if (count > MAX_RATING_KEYS) return null;
  if (!ask.ids.every((id) => placeIdSchema.safeParse(id).success)) return null;
  if (!ask.keys.every((key) => listingKeySchema.safeParse(key).success)) return null;
  return ask;
}

/** `GET /api/directory/ratings?keys=k1,k2,…` / `?ids=i1,i2,…`: the rating summary of each business that has
 * published reviews, keyed by what was asked, cached by shared caches for 60 seconds. */
export async function handleRatingsRequest(request: Request, deps: RatingsIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const ask = parseDirectoryAsk(new URL(request.url).searchParams);
  if (ask === null) return reply(400, { error: BUSINESSES_REFUSAL } satisfies ErrorBody);
  try {
    const body: RatingsResponse = await deps.readRatings(ask);
    return reply(200, body, LIST_CACHE_CONTROL);
  } catch (error) {
    console.error("Could not read directory ratings.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/status?keys=k1,k2 or ?ids=i1,i2
// ---------------------------------------------------------------------------------------------------------------

export interface StatusIntakeDeps {
  readonly token: string | null;
  readonly readStatuses: (ask: DirectoryAsk) => Promise<StatusResponse>;
}

/** `GET /api/directory/status?keys=k1,k2,…` / `?ids=i1,i2,…`: each business Fynix has verified, with the number to
 * show, keyed by what was asked, cached by shared caches for 60 seconds like the ratings. */
export async function handleStatusRequest(request: Request, deps: StatusIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const ask = parseDirectoryAsk(new URL(request.url).searchParams);
  if (ask === null) return reply(400, { error: BUSINESSES_REFUSAL } satisfies ErrorBody);
  try {
    const body: StatusResponse = await deps.readStatuses(ask);
    return reply(200, body, LIST_CACHE_CONTROL);
  } catch (error) {
    console.error("Could not read directory statuses.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/gallery?keys=k1,k2 or ?ids=i1,i2
// ---------------------------------------------------------------------------------------------------------------

export interface GalleryIntakeDeps {
  readonly token: string | null;
  readonly readGalleries: (ask: DirectoryAsk) => Promise<GalleryResponse>;
}

/** `GET /api/directory/gallery?keys=k1,k2,…` / `?ids=i1,i2,…`: each business that has gallery photos or approved videos,
 * keyed by what was asked, cached by shared caches for 60 seconds like the statuses. */
export async function handleGalleryRequest(request: Request, deps: GalleryIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const ask = parseDirectoryAsk(new URL(request.url).searchParams);
  if (ask === null) return reply(400, { error: BUSINESSES_REFUSAL } satisfies ErrorBody);
  try {
    const body: GalleryResponse = await deps.readGalleries(ask);
    return reply(200, body, LIST_CACHE_CONTROL);
  } catch (error) {
    console.error("Could not read directory galleries.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/signals?keys=k1,k2 or ?ids=i1,i2
// ---------------------------------------------------------------------------------------------------------------

export interface SignalsIntakeDeps {
  readonly token: string | null;
  readonly readSignals: (ask: DirectoryAsk, now: Date) => Promise<SignalsResponse>;
  readonly now: () => Date;
}

/** `GET /api/directory/signals?keys=k1,k2,…` / `?ids=i1,i2,…`: each business that is Trending today or showing a paid
 * tag, keyed by what was asked, cached by shared caches for 60 seconds like the ratings and statuses. */
export async function handleSignalsRequest(request: Request, deps: SignalsIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const ask = parseDirectoryAsk(new URL(request.url).searchParams);
  if (ask === null) return reply(400, { error: BUSINESSES_REFUSAL } satisfies ErrorBody);
  try {
    const body: SignalsResponse = await deps.readSignals(ask, deps.now());
    return reply(200, body, LIST_CACHE_CONTROL);
  } catch (error) {
    console.error("Could not read directory signals.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/events
// ---------------------------------------------------------------------------------------------------------------

export interface EventIntakeDeps {
  readonly token: string | null;
  /** Counts the visitor once per business, kind and day, within a per-address ceiling. */
  readonly recordEvent: (event: DirectoryEvent, now: Date) => Promise<DirectoryEventOutcome>;
  readonly now: () => Date;
}

/** The contract names only the schema of this answer, so its type is read off it here. */
type DirectoryEventResponse = z.infer<typeof directoryEventResponseSchema>;
const COUNTED: DirectoryEventResponse = { status: "counted" };

/** `POST /api/directory/events`: one page view or contact tap on one business, named by key or id. Every well-formed
 * event is answered 202 "counted" -- a repeat, an address over its ceiling, an id no business has and a failure
 * (logged) alike -- so a caller learns nothing about the de-duplication or the limits. */
export async function handleEventRequest(request: Request, deps: EventIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_EVENT_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = directoryEventRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a directory event." } satisfies ErrorBody);
  const { key, id, kind, clientIp } = parsedRequest.data;
  // The contract names exactly one of the two.
  const business: DirectoryNamed | null =
    id !== undefined ? { by: "id", id } : key !== undefined ? { by: "key", key } : null;
  if (business === null) return reply(400, { error: "The body is not a directory event." } satisfies ErrorBody);

  await deps.recordEvent({ business, kind, clientIp }, deps.now());
  return reply(202, COUNTED);
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/ad-events
// ---------------------------------------------------------------------------------------------------------------

export interface AdEventIntakeDeps {
  readonly token: string | null;
  /** Counts the visitor once per ad, placement, kind and day, within a per-address ceiling, while the ad is running. */
  readonly recordAdEvent: (event: DirectoryAdEvent, now: Date) => Promise<DirectoryAdEventOutcome>;
  readonly now: () => Date;
}

/** `POST /api/directory/ad-events`: one sighting or click of an ad. Answered 202 "counted" whatever became of it, so a
 * caller learns nothing about the de-duplication, the limits or which ads are running. */
export async function handleAdEventRequest(request: Request, deps: AdEventIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_EVENT_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = directoryAdEventRequestSchema.safeParse(body.value);
  if (!parsed.success) return reply(400, { error: "The body is not a directory ad event." } satisfies ErrorBody);
  const { id, placement, kind, clientIp } = parsed.data;
  await deps.recordAdEvent({ placeId: id, placement, kind, clientIp }, deps.now());
  return reply(202, COUNTED);
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/reviews?key=…&page=1 or ?id=…&page=1
// ---------------------------------------------------------------------------------------------------------------

export interface ReviewsIntakeDeps {
  readonly token: string | null;
  readonly readReviews: (business: DirectoryNamed, page: number) => Promise<ReviewsResponse>;
}

/** The one business a reviews request names: `id` or `key`, not both; null when neither is a valid one. */
export function parseNamedBusiness(params: URLSearchParams): DirectoryNamed | null {
  const rawId = params.get("id");
  const rawKey = params.get("key");
  if ((rawId === null) === (rawKey === null)) return null;
  if (rawId !== null) {
    const id = placeIdSchema.safeParse(rawId);
    return id.success ? { by: "id", id: id.data } : null;
  }
  const key = listingKeySchema.safeParse(rawKey);
  return key.success ? { by: "key", key: key.data } : null;
}

/** A 1-based page number: absent is 1; anything but a plain positive whole number up to MAX_REVIEWS_PAGE is null. */
export function parseReviewsPage(raw: string | null): number | null {
  if (raw === null) return 1;
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const page = Number(raw);
  return page <= MAX_REVIEWS_PAGE ? page : null;
}

/** `GET /api/directory/reviews?key=…&page=1` / `?id=…&page=1`: a business's published reviews, 10 a page, newest
 * first. Not cached, so a review shows as soon as it is published. */
export async function handleReviewsRequest(request: Request, deps: ReviewsIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const params = new URL(request.url).searchParams;
  const business = parseNamedBusiness(params);
  if (business === null) return reply(400, { error: "Name one business, by its id or its key." } satisfies ErrorBody);
  const page = parseReviewsPage(params.get("page"));
  if (page === null) return reply(400, { error: "The page must be a whole number from 1." } satisfies ErrorBody);
  try {
    const body: ReviewsResponse = await deps.readReviews(business, page);
    return reply(200, body);
  } catch (error) {
    console.error("Could not read directory reviews.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/reviews/otp
// ---------------------------------------------------------------------------------------------------------------

export interface ReviewOtpIntakeDeps {
  readonly token: string | null;
  /** Rate-limits, stores the review with a hashed code and sends the code (no code can be asked for any more: always `unavailable`). */
  readonly requestOtp: (input: ReviewInput, clientIp: string, now: Date) => Promise<ReviewOtpOutcome>;
  /** Looks up the visitor a request's token names (null when it is no good). */
  readonly resolveVisitor: ResolveVisitor;
  /** Publishes a recognised visitor's review with no code. */
  readonly publishAsVisitor: (input: ReviewInput, visitor: ResolvedVisitor, clientIp: string, now: Date) => Promise<ReviewOtpOutcome>;
  readonly now: () => Date;
}

/** A meaningless but plausible hint for the honeypot's fake success, from whatever digits the bot sent. */
function fakePhoneHint(rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, "");
  return `•••• ${digits.length >= 4 ? digits.slice(-4) : "0000"}`;
}

/** Maps a review code request's outcome onto its HTTP response. */
export function reviewOtpResponse(outcome: ReviewOtpOutcome): Response {
  switch (outcome.kind) {
    case "otp_sent": {
      const body: ReviewOtpResponse = {
        status: "otp_sent",
        otpId: outcome.otpId,
        expiresInSeconds: outcome.expiresInSeconds,
        phoneHint: outcome.phoneHint,
      };
      return reply(200, body);
    }
    case "published": {
      const body: ReviewOtpResponse = { status: "published", visitor: outcome.visitor };
      return reply(200, body);
    }
    case "signed_out":
      return directoryError(401, "signed_out", SIGNED_OUT_MESSAGE);
    case "invalid":
      return directoryError(422, "invalid", outcome.message, outcome.field);
    case "unknown_business":
      return directoryError(422, "invalid", UNKNOWN_BUSINESS_MESSAGE);
    case "limited":
      return directoryError(429, "limited", LIMITED_MESSAGE);
    case "unavailable":
      return directoryError(403, "unavailable", UNAVAILABLE_MESSAGE);
    case "failed":
      return directoryError(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled review code outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** `POST /api/directory/reviews/otp`: a visitor's review, held until the code sent to them is confirmed. */
export async function handleReviewOtpRequest(request: Request, deps: ReviewOtpIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_FORM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = reviewOtpRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a review code request." } satisfies ErrorBody);

  // A bot gets the same answer as a person, so it learns nothing. Nothing is stored or sent.
  if (isHoneypotFilled(parsedRequest.data.website)) {
    return reviewOtpResponse({
      kind: "otp_sent",
      otpId: randomUUID(),
      expiresInSeconds: OTP_TTL_SECONDS,
      phoneHint: fakePhoneHint(parsedRequest.data.phone.number),
    });
  }

  const now = deps.now();
  const gate = await gateVisitor(parsedRequest.data.visitorToken, deps.resolveVisitor, now);
  if (gate.kind === "signed_out") return reviewOtpResponse({ kind: "signed_out" });

  const fields = parseReviewFields(parsedRequest.data, gate.kind === "visitor" ? gate.visitor.identity : undefined);
  if (!fields.success) return directoryError(422, "invalid", fields.message, fields.field);

  if (gate.kind === "visitor") {
    return reviewOtpResponse(await deps.publishAsVisitor(fields.data, gate.visitor, parsedRequest.data.clientIp, now));
  }
  return reviewOtpResponse(await deps.requestOtp(fields.data, parsedRequest.data.clientIp, now));
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/reviews/confirm
// ---------------------------------------------------------------------------------------------------------------

export interface ReviewConfirmIntakeDeps {
  readonly token: string | null;
  /** Checks the code and publishes its review. */
  readonly confirmOtp: (otpId: string, code: string, clientIp: string, now: Date) => Promise<ReviewConfirmOutcome>;
  readonly now: () => Date;
}

/** Maps a review confirmation's outcome onto its HTTP response. */
export function reviewConfirmResponse(outcome: ReviewConfirmOutcome): Response {
  switch (outcome.kind) {
    case "published": {
      const body: ReviewConfirmResponse = outcome.visitor === undefined ? { status: "published" } : { status: "published", visitor: outcome.visitor };
      return reply(200, body);
    }
    case "expired":
      return directoryError(410, "expired", EXPIRED_MESSAGE);
    case "too_many_attempts":
      return directoryError(429, "too_many_attempts", outcome.message);
    case "wrong_code":
      return directoryError(422, "wrong_code", outcome.message, "code");
    case "limited":
      return directoryError(429, "limited", LIMITED_MESSAGE);
    case "failed":
      return directoryError(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled review confirmation outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** `POST /api/directory/reviews/confirm`: the code from the text, which publishes the review it was holding. */
export async function handleReviewConfirmRequest(request: Request, deps: ReviewConfirmIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_CONFIRM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = reviewConfirmRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a review confirmation." } satisfies ErrorBody);

  const { otpId, code, clientIp } = parsedRequest.data;
  return reviewConfirmResponse(await deps.confirmOtp(otpId, code, clientIp, deps.now()));
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/reviews/helpful
// ---------------------------------------------------------------------------------------------------------------

export interface ReviewHelpfulIntakeDeps {
  readonly token: string | null;
  /** Counts the visitor once a week per review, within a per-address ceiling. */
  readonly markHelpful: (reviewId: string, clientIp: string, now: Date) => Promise<ReviewHelpfulOutcome>;
  readonly now: () => Date;
}

/** Maps a Helpful mark's outcome onto its HTTP response. */
export function reviewHelpfulResponse(outcome: ReviewHelpfulOutcome): Response {
  switch (outcome.kind) {
    case "counted": {
      const body: ReviewHelpfulResponse = { status: "counted", helpful: outcome.helpful };
      return reply(200, body);
    }
    case "unknown_review":
      return directoryError(422, "invalid", UNKNOWN_REVIEW_MESSAGE);
    case "limited":
      return directoryError(429, "limited", LIMITED_MESSAGE);
    case "failed":
      return directoryError(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled review helpful outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** `POST /api/directory/reviews/helpful`: one visitor found one published review helpful. */
export async function handleReviewHelpfulRequest(request: Request, deps: ReviewHelpfulIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_HELPFUL_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = reviewHelpfulRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a helpful mark." } satisfies ErrorBody);

  const { reviewId, clientIp } = parsedRequest.data;
  return reviewHelpfulResponse(await deps.markHelpful(reviewId, clientIp, deps.now()));
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/reviews/comments/otp
// ---------------------------------------------------------------------------------------------------------------

export interface CommentOtpIntakeDeps {
  readonly token: string | null;
  /** Rate-limits, stores the comment with a hashed code and sends the code (no code can be asked for any more: always `unavailable`). */
  readonly requestOtp: (input: CommentInput, clientIp: string, now: Date) => Promise<CommentOtpOutcome>;
  /** Looks up the visitor a request's token names (null when it is no good). */
  readonly resolveVisitor: ResolveVisitor;
  /** Publishes a recognised visitor's comment with no code. */
  readonly publishAsVisitor: (input: CommentInput, visitor: ResolvedVisitor, clientIp: string, now: Date) => Promise<CommentOtpOutcome>;
  readonly now: () => Date;
}

/** Maps a comment code request's outcome onto its HTTP response: the review code's, plus a review that is gone. */
export function commentOtpResponse(outcome: CommentOtpOutcome): Response {
  if (outcome.kind === "unknown_review") return directoryError(422, "invalid", UNKNOWN_REVIEW_MESSAGE);
  return reviewOtpResponse(outcome);
}

/** `POST /api/directory/reviews/comments/otp`: a visitor's comment on a review, held until the code sent to them is
 * confirmed (at `/comments/confirm`, which answers like `/reviews/confirm`). */
export async function handleCommentOtpRequest(request: Request, deps: CommentOtpIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_FORM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = commentOtpRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a comment code request." } satisfies ErrorBody);

  // A bot gets the same answer as a person, so it learns nothing. Nothing is stored or sent.
  if (isHoneypotFilled(parsedRequest.data.website)) {
    return reviewOtpResponse({
      kind: "otp_sent",
      otpId: randomUUID(),
      expiresInSeconds: OTP_TTL_SECONDS,
      phoneHint: fakePhoneHint(parsedRequest.data.phone.number),
    });
  }

  const now = deps.now();
  const gate = await gateVisitor(parsedRequest.data.visitorToken, deps.resolveVisitor, now);
  if (gate.kind === "signed_out") return commentOtpResponse({ kind: "signed_out" });

  const fields = parseCommentFields(parsedRequest.data, gate.kind === "visitor" ? gate.visitor.identity : undefined);
  if (!fields.success) return directoryError(422, "invalid", fields.message, fields.field);

  if (gate.kind === "visitor") {
    return commentOtpResponse(await deps.publishAsVisitor(fields.data, gate.visitor, parsedRequest.data.clientIp, now));
  }
  return commentOtpResponse(await deps.requestOtp(fields.data, parsedRequest.data.clientIp, now));
}

// ---------------------------------------------------------------------------------------------------------------
// POST /api/directory/enquiries
// ---------------------------------------------------------------------------------------------------------------

export interface EnquiryIntakeDeps {
  readonly token: string | null;
  /** Finds the business, rate-limits and stores the enquiry. */
  readonly recordEnquiry: (enquiry: EnquiryInput, clientIp: string, now: Date) => Promise<EnquiryOutcome>;
  /** Looks up the visitor a request's token names (null when it is no good). */
  readonly resolveVisitor: ResolveVisitor;
  readonly now: () => Date;
}

const RECEIVED: EnquiryResponse = { status: "received" };

/** Maps an enquiry's outcome onto its HTTP response. */
export function enquiryResponse(outcome: EnquiryOutcome, visitor?: VisitorSession): Response {
  switch (outcome) {
    case "received":
      return reply(200, visitor === undefined ? RECEIVED : ({ status: "received", visitor } satisfies EnquiryResponse));
    case "unknown_business":
      return directoryError(422, "invalid", UNKNOWN_BUSINESS_MESSAGE);
    case "limited":
      return directoryError(429, "limited", LIMITED_MESSAGE);
    case "failed":
      return directoryError(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled enquiry outcome: ${String(unhandled)}`);
    }
  }
}

/** `POST /api/directory/enquiries`: "Send enquiry" about one business, or "Get the list of top …" for an area. */
export async function handleEnquiryRequest(request: Request, deps: EnquiryIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "POST", deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_FORM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsedRequest = enquiryRequestSchema.safeParse(body.value);
  if (!parsedRequest.success) return reply(400, { error: "The body is not an enquiry." } satisfies ErrorBody);

  // A bot gets the same answer as a person, so it learns nothing. Nothing is stored.
  if (isHoneypotFilled(parsedRequest.data.website)) return enquiryResponse("received");

  const now = deps.now();
  const gate = await gateVisitor(parsedRequest.data.visitorToken, deps.resolveVisitor, now);
  if (gate.kind === "signed_out") return directoryError(401, "signed_out", SIGNED_OUT_MESSAGE);

  const visitor = gate.kind === "visitor" ? gate.visitor : undefined;
  const fields = parseEnquiryFields(parsedRequest.data, visitor?.identity);
  if (!fields.success) return directoryError(422, "invalid", fields.message, fields.field);

  return enquiryResponse(await deps.recordEnquiry(fields.data, parsedRequest.data.clientIp, now), visitor?.session);
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/ads?market=<category>/<city>/<area>
// ---------------------------------------------------------------------------------------------------------------

export interface AdsIntakeDeps {
  readonly token: string | null;
  /** This week's paid ads in the market, after settling any auction that is due. */
  readonly readAds: (market: string, now: Date) => Promise<AdsResponse>;
  readonly now: () => Date;
}

/** `GET /api/directory/ads?market=…`: the market's paid ads this week, cached for a minute like the other list reads. */
export async function handleAdsRequest(request: Request, deps: AdsIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;

  const market = adMarketSchema.safeParse(new URL(request.url).searchParams.get("market"));
  if (!market.success) return reply(400, { error: "Name one market as <category>/<city>/<area>." } satisfies ErrorBody);
  try {
    return reply(200, await deps.readAds(market.data, deps.now()), LIST_CACHE_CONTROL);
  } catch (error) {
    console.error("Could not read directory ads.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// GET /api/directory/pictures/<id>
// ---------------------------------------------------------------------------------------------------------------

export interface PictureIntakeDeps {
  readonly token: string | null;
  /**
   * The response for one approved picture: the image, 304 when `ifNoneMatch` already names it, or 404 for a picture
   * that is not approved, was removed or never existed.
   */
  readonly servePicture: (pictureId: string, ifNoneMatch: string | null, width: PictureCopyWidth | null) => Promise<Response>;
}

/**
 * The width the website asked for in `?w=`: one of the widths a picture is copied to, written as plain digits. Anything
 * else (a made-up size, a repeated parameter, an empty value) is no request for a size, so the picture is served as it
 * is rather than refused.
 */
export function parsePictureWidth(url: URL): PictureCopyWidth | null {
  const values = url.searchParams.getAll("w");
  if (values.length !== 1) return null;
  const value = values[0] ?? "";
  if (!/^[0-9]{1,4}$/.test(value)) return null;
  const width = Number(value);
  return isPictureCopyWidth(width) ? width : null;
}

/** `GET /api/directory/pictures/<id>`: one approved listing picture, for the website to pass on to its visitors. The
 * id is only ever looked up, so anything that is not one is simply not found. */
export async function handlePictureRequest(request: Request, pictureId: string, deps: PictureIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, "GET", deps.token);
  if (refused !== null) return refused;
  try {
    return await deps.servePicture(pictureId, request.headers.get("if-none-match"), parsePictureWidth(new URL(request.url)));
  } catch (error) {
    console.error("Could not read a directory picture.", errorLogInfo(error));
    return reply(500, { error: FAILED_MESSAGE } satisfies ErrorBody);
  }
}
