import { z } from "zod";
import { placeIdSchema } from "./directory-api";

/**
 * The contract of the platform's privacy request routes, called server-to-server by the marketing website with
 * `Authorization: Bearer <LEADS_API_TOKEN>`. The website keeps a copy of this file (lib/privacy-requests-api.ts there); change
 * both together. A request is made in two steps: `POST /api/privacy-requests/otp` emails a code to the address given (changed
 * 2026-10-14: the code used to go to a phone number, and the form's `phone` is now `email`), and
 * `POST /api/privacy-requests/confirm` takes the code, which proves the address is the person's and files the request.
 *
 * `POST /api/privacy-requests/contribution` (added 2026-10-13) is a visitor deleting one review or comment of theirs from the
 * Delete link under it. Only a visitor the website already recognises (`visitorToken`) can: it is deleted at once. Since
 * 2026-10-14 there is no code step for anyone else: nothing is sent to a phone any more.
 */

/**
 * What the public form offers; each waits for staff once its code is confirmed. (`visitor_erasure`, which was carried out
 * the moment a phone number was proven, is gone: an emailed code cannot prove a number.) `content_report` (a review or comment) and
 * `listing_removal` (a business listing) are complaints about what the local directory shows, due in 15 days under the IT
 * Rules; the Report links on the website open the form with one of them chosen and `about` filled in.
 */
export const PUBLIC_REQUEST_KINDS = ["access", "correction", "erasure", "nomination", "grievance", "content_report", "listing_removal"] as const;

/** The longest page address `about` may be. */
export const REQUEST_ABOUT_MAX_LENGTH = 500;
export type PublicRequestKind = (typeof PUBLIC_REQUEST_KINDS)[number];

export const REQUEST_NAME_MAX_LENGTH = 200;
export const REQUEST_DETAILS_MAX_LENGTH = 2000;

/** The address as typed; read and checked on the server. */
const emailEntrySchema = z.string().max(1000);
/** A client address as the website read it; anything longer is not an address. */
const clientIpSchema = z.string().min(1).max(64);

export const privacyRequestOtpRequestSchema = z.object({
  kind: z.enum(PUBLIC_REQUEST_KINDS),
  name: z.string().max(1000),
  /** The address the code is emailed to, and the contact the filed request keeps. */
  email: emailEntrySchema,
  details: z.string().max(10_000),
  /** Honeypot: a person never fills it. */
  website: z.string().max(2000),
  clientIp: clientIpSchema,
  /** Which version of the Privacy Notice was on the page, kept as proof of the notice they saw (DPDP Act s.5, r.3). */
  noticeVersion: z.string().min(1).max(40).optional(),
  /**
   * The website page the request is about (added 2026-10-13): a review, a comment or a listing, as a full address on the
   * website's own origin. Anything else is refused with 400. Kept with what the person wrote, for staff to open.
   */
  about: z.string().min(1).max(REQUEST_ABOUT_MAX_LENGTH).optional(),
});
export type PrivacyRequestOtpRequest = z.infer<typeof privacyRequestOtpRequestSchema>;

export const privacyRequestConfirmRequestSchema = z.object({
  otpId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  clientIp: clientIpSchema,
});
export type PrivacyRequestConfirmRequest = z.infer<typeof privacyRequestConfirmRequestSchema>;

export const PRIVACY_REQUEST_FIELDS = ["kind", "name", "email", "details", "code"] as const;
export type PrivacyRequestField = (typeof PRIVACY_REQUEST_FIELDS)[number];

/**
 * What a deletion is about: one review or one comment by its id, or (`business`, by its place id) everything the visitor
 * posted on one business page: their review there and their comments on its reviews.
 */
export const contributionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["review", "comment"]), id: z.uuid() }),
  z.object({ kind: z.literal("business"), id: placeIdSchema }),
]);
export type ContributionTarget = z.infer<typeof contributionTargetSchema>;

/** The most review ids one page may ask about: a page shows 20 reviews; the rest is headroom. */
export const OWN_CONTRIBUTIONS_MAX_REVIEWS = 50;

/**
 * `POST /api/privacy-requests/contribution/mine` (added 2026-10-13): which of a page's reviews, and which comments on them,
 * a remembered visitor wrote, so the page shows "Delete" on those alone. A stale token is `signed_out`.
 */
export const ownContributionsRequestSchema = z.object({
  visitorToken: z.string().min(1).max(300),
  reviewIds: z.array(z.uuid()).max(OWN_CONTRIBUTIONS_MAX_REVIEWS),
  clientIp: clientIpSchema,
});
export type OwnContributionsRequest = z.infer<typeof ownContributionsRequestSchema>;

export const contributionDeletionRequestSchema = z.object({
  target: contributionTargetSchema,
  /** The token of a visitor whose number a code has already proven (as for posting): deleted at once. */
  visitorToken: z.string().min(1).max(300),
  clientIp: clientIpSchema,
  noticeVersion: z.string().min(1).max(40).optional(),
});
export type ContributionDeletionRequest = z.infer<typeof contributionDeletionRequestSchema>;

export const privacyRequestErrorSchema = z.object({
  status: z.literal("error"),
  /** `signed_out`: the visitor token sent is not good any more. */
  code: z.enum(["invalid", "limited", "expired", "wrong_code", "too_many_attempts", "unavailable", "failed", "signed_out"]),
  message: z.string(),
  field: z.enum(PRIVACY_REQUEST_FIELDS).nullable(),
});
export type PrivacyRequestError = z.infer<typeof privacyRequestErrorSchema>;

export const privacyRequestOtpResponseSchema = z.union([
  z.object({ status: z.literal("otp_sent"), otpId: z.uuid(), expiresInSeconds: z.number().int().positive(), emailHint: z.string() }),
  privacyRequestErrorSchema,
]);
export type PrivacyRequestOtpResponse = z.infer<typeof privacyRequestOtpResponseSchema>;

/** One review or comment deleted, with the reference of the record of it. */
const deletedResponseSchema = z.object({ status: z.literal("deleted"), reference: z.string() });
/** Nothing posted with this number has that id (someone else's, or already gone). Nothing was done or filed. */
const notFoundResponseSchema = z.object({ status: z.literal("not_found") });

export const privacyRequestConfirmResponseSchema = z.union([
  /** `dueAt` is the day the reply is due, as ISO text. */
  z.object({ status: z.literal("received"), reference: z.string(), dueAt: z.string() }),
  privacyRequestErrorSchema,
]);
export type PrivacyRequestConfirmResponse = z.infer<typeof privacyRequestConfirmResponseSchema>;

export const contributionDeletionResponseSchema = z.union([
  deletedResponseSchema,
  notFoundResponseSchema,
  privacyRequestErrorSchema,
]);
export type ContributionDeletionResponse = z.infer<typeof contributionDeletionResponseSchema>;

export const ownContributionsResponseSchema = z.union([
  z.object({ status: z.literal("ok"), reviews: z.array(z.uuid()), comments: z.array(z.uuid()) }),
  privacyRequestErrorSchema,
]);
export type OwnContributionsResponse = z.infer<typeof ownContributionsResponseSchema>;
