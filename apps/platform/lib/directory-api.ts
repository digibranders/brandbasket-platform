/**
 * The contract between the marketing website and the platform for the local directory's ratings, reviews and
 * enquiries (docs/superpowers/specs/2026-09-29-directory-reviews-enquiries-design.md). The website's server calls
 * these routes with the same shared secret as the Get started form (`Authorization: Bearer <LEADS_API_TOKEN>`), so
 * the website still holds no database credentials.
 *
 * The website repository keeps an identical copy of this file (lib/directory-api.ts). Change both together, and only
 * ever additively: a deployed website and platform may briefly disagree on the version.
 */
import { z } from "zod";

export const DIRECTORY_RATINGS_PATH = "/api/directory/ratings";
export const DIRECTORY_REVIEWS_PATH = "/api/directory/reviews";
export const DIRECTORY_REVIEW_OTP_PATH = "/api/directory/reviews/otp";
export const DIRECTORY_REVIEW_CONFIRM_PATH = "/api/directory/reviews/confirm";
export const DIRECTORY_ENQUIRIES_PATH = "/api/directory/enquiries";
/** Review actions (added 2026-10-08): mark a review Helpful, and comment on it with the same texted code as a review. */
export const DIRECTORY_REVIEW_HELPFUL_PATH = "/api/directory/reviews/helpful";
export const DIRECTORY_COMMENT_OTP_PATH = "/api/directory/reviews/comments/otp";
export const DIRECTORY_COMMENT_CONFIRM_PATH = "/api/directory/reviews/comments/confirm";

/** Cards show the average rating from this many published reviews up (the user asked for any review to count); the
 * API always returns the real count. */
export const MIN_REVIEWS_FOR_STARS = 1;
/** The most businesses (ids and keys together) one ratings, status or signals request may ask about: one list page is 20. */
export const MAX_RATING_KEYS = 50;
export const REVIEWS_PAGE_SIZE = 10;
export const REVIEW_TEXT_MAX_LENGTH = 500;
export const REVIEWER_NAME_MAX_LENGTH = 60;
export const ENQUIRY_MESSAGE_MAX_LENGTH = 500;
export const COMMENT_TEXT_MAX_LENGTH = 300;
/** The most comments a review's answer carries (its latest, oldest first); `commentCount` says how many it has in all. Must match the platform's DIRECTORY_COMMENTS_SHOWN_PER_REVIEW. */
export const COMMENTS_SHOWN_PER_REVIEW = 20;
export const MAX_HIGHLIGHTS_PER_REVIEW = 2;

/** `<service>/<city>/<area>/<slug>`, the same four segments as the business's own URL. */
export const LISTING_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){3}$/;
export const listingKeySchema = z.string().max(200).regex(LISTING_KEY_PATTERN);

/**
 * A business's permanent id (added 2026-10-01, docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md):
 * the last part of its URL, seven characters from 23456789abcdefghjkmnpqrstuvwxyz with at least one digit. Every
 * request may name businesses by `id`/`ids` instead of `key`/`keys` (not both for one business), and every answer is
 * keyed by whichever it was asked by. Keys keep working until the website has switched to ids.
 */
export const PLACE_ID_PATTERN = /^(?=[a-z2-9]*[2-9])[23456789abcdefghjkmnpqrstuvwxyz]{7}$/;
export const placeIdSchema = z.string().regex(PLACE_ID_PATTERN);

/** A body that names one business: by its listing key or by its id, never both. */
function namesOneBusiness(body: { readonly key?: string | null; readonly id?: string | null }): boolean {
  return (body.key === undefined || body.key === null) !== (body.id === undefined || body.id === null);
}
const ONE_BUSINESS_MESSAGE = "Name the business by its key or its id, not both.";

/** JustDial's "Suggestions", as a fixed list so they can be counted: in this order, which also breaks ties. */
export const REVIEW_HIGHLIGHTS = [
  { id: "good_service", label: "Good service" },
  { id: "value_for_money", label: "Value for money" },
  { id: "friendly_staff", label: "Friendly staff" },
  { id: "clean", label: "Clean and tidy" },
  { id: "on_time", label: "On time" },
  { id: "quality", label: "Great quality" },
  { id: "expert", label: "Knows their stuff" },
  { id: "quick_response", label: "Quick to respond" },
] as const;

export type ReviewHighlightId = (typeof REVIEW_HIGHLIGHTS)[number]["id"];
export const REVIEW_HIGHLIGHT_IDS = REVIEW_HIGHLIGHTS.map((highlight) => highlight.id) as [ReviewHighlightId, ...ReviewHighlightId[]];
export const reviewHighlightIdSchema = z.enum(REVIEW_HIGHLIGHT_IDS);

const highlightSchema = z.object({ id: reviewHighlightIdSchema, label: z.string() });

export const ratingSummarySchema = z.object({
  /** Rounded to one decimal. */
  average: z.number().min(1).max(5),
  count: z.number().int().min(1),
  topHighlight: highlightSchema.extend({ count: z.number().int().min(1) }).nullable(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

/** `GET /api/directory/ratings?keys=k1,k2` or `?ids=i1,i2` (or both): businesses with no published reviews are left
 * out; the rest are keyed by the id or key they were asked by. */
export const ratingsResponseSchema = z.object({ ratings: z.record(z.string(), ratingSummarySchema) });
export type RatingsResponse = z.infer<typeof ratingsResponseSchema>;

export const publicCommentSchema = z.object({
  id: z.string(),
  /** First name and initial, e.g. "Priya S." -- never the full name or the phone. */
  name: z.string(),
  text: z.string(),
  /** ISO 8601. */
  createdAt: z.string(),
  /** The business's own verified owner answering: `name` is then the business's name, and the page tags it "Owner". Absent from an older platform's answer, which is the same as false (added 2026-10-12). */
  byOwner: z.boolean().optional(),
  /** The owner changed what they wrote after posting it. Absent is false. */
  edited: z.boolean().optional(),
});
export type PublicComment = z.infer<typeof publicCommentSchema>;

export const publicReviewSchema = z.object({
  id: z.string(),
  /** First name and initial, e.g. "Priya S." -- never the full name or the phone. */
  name: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string().nullable(),
  highlights: z.array(highlightSchema),
  /** ISO 8601. */
  createdAt: z.string(),
  /** How many visitors marked it Helpful. Absent from an older platform's answer, which is the same as none (added 2026-10-08). */
  helpful: z.number().int().min(0).optional(),
  /** How many published comments it has in all; absent is none. */
  commentCount: z.number().int().min(0).optional(),
  /** Its latest COMMENTS_SHOWN_PER_REVIEW comments, oldest first; absent is none. */
  comments: z.array(publicCommentSchema).optional(),
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

/** `GET /api/directory/reviews?key=…&page=1` or `?id=…&page=1`: published reviews, newest first. */
export const reviewsResponseSchema = z.object({
  summary: ratingSummarySchema.nullable(),
  reviews: z.array(publicReviewSchema),
  page: z.number().int().min(1),
  pageCount: z.number().int().min(1),
});
export type ReviewsResponse = z.infer<typeof reviewsResponseSchema>;

const phoneEntrySchema = z.object({ country: z.string().max(8), number: z.string().max(40) });
/**
 * The token of a visitor whose number a texted code has already proven (added 2026-10-09), as the platform issued it.
 * With one, the platform takes the visitor's name and number from their account and sends no code; `name` and `phone`
 * in the same request are ignored. A token that is forged, expired or unknown is answered with `signed_out`.
 */
const visitorTokenSchema = z.string().min(1).max(300).optional();
/**
 * Which version of the Terms and Privacy Notice was on the page when the visitor posted (added 2026-10-12), kept as proof
 * of the notice they saw (DPDP Act s.5, r.3). Optional while the website catches up with the platform.
 */
const noticeVersionSchema = z.string().min(1).max(40).optional();
/**
 * True when the visitor ticked that they are 18 or over (added 2026-10-12). Recorded with the notice version. Since
 * 2026-10-13 a review or comment without it is refused (`invalid`, no field), so the rule never rests on the form alone.
 */
const adultSchema = z.boolean().optional();
/** What a successful request hands back about a recognised visitor: a renewed token and what the header shows. */
export const visitorSessionSchema = z.object({ token: z.string(), name: z.string(), phoneHint: z.string() });
export type VisitorSessionPayload = z.infer<typeof visitorSessionSchema>;
/** A client address as the website read it; anything longer is not an address. */
const clientIpSchema = z.string().min(1).max(64);

export const reviewOtpRequestSchema = z
  .object({
    /** The business, by its listing key or (`id`) its permanent id: exactly one of the two. */
    key: listingKeySchema.optional(),
    id: placeIdSchema.optional(),
    businessName: z.string().min(1).max(200),
    rating: z.number().int().min(1).max(5),
    text: z.string().max(2000),
    highlights: z.array(z.string().max(40)).max(8),
    name: z.string().max(200),
    phone: phoneEntrySchema,
    /** Honeypot: a person never fills it. */
    website: z.string().max(2000),
    clientIp: clientIpSchema,
    visitorToken: visitorTokenSchema,
    noticeVersion: noticeVersionSchema,
    adult: adultSchema,
    /**
     * True when the reviewer ticked "Let this business contact me about this review" (added 2026-10-13). Only then does
     * the business's owner see their number. Absent or false means no.
     */
    ownerContact: z.boolean().optional(),
  })
  .refine(namesOneBusiness, ONE_BUSINESS_MESSAGE);
export type ReviewOtpRequest = z.infer<typeof reviewOtpRequestSchema>;

export const reviewConfirmRequestSchema = z.object({
  otpId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  clientIp: clientIpSchema,
});
export type ReviewConfirmRequest = z.infer<typeof reviewConfirmRequestSchema>;

export const enquiryRequestSchema = z.object({
  /**
   * The business, by its listing key or (`id`) its permanent id: one of the two for a business enquiry. Both null or
   * absent for the list page's "Get the list of top …" form, which is about a category and area, not one business.
   */
  key: listingKeySchema.nullable().optional(),
  id: placeIdSchema.nullable().optional(),
  businessName: z.string().max(200).nullable(),
  serviceLabel: z.string().min(1).max(120),
  areaLabel: z.string().min(1).max(120),
  kind: z.enum(["business", "top_list"]),
  name: z.string().max(200),
  phone: phoneEntrySchema,
  message: z.string().max(2000),
  website: z.string().max(2000),
  clientIp: clientIpSchema,
  visitorToken: visitorTokenSchema,
  noticeVersion: noticeVersionSchema,
});
export type EnquiryRequest = z.infer<typeof enquiryRequestSchema>;

/** The fields an error may point the visitor at. */
export const DIRECTORY_FORM_FIELDS = ["rating", "text", "highlights", "name", "phone", "phoneCountry", "message", "code"] as const;
export type DirectoryFormField = (typeof DIRECTORY_FORM_FIELDS)[number];

export const DIRECTORY_ERROR_CODES = [
  "invalid",
  "wrong_code",
  "expired",
  "too_many_attempts",
  "limited",
  "unavailable",
  "failed",
  /** The visitor token sent is not good any more: the form must ask for the name and number again. */
  "signed_out",
] as const;

const errorSchema = z.object({
  status: z.literal("error"),
  code: z.enum(DIRECTORY_ERROR_CODES),
  message: z.string(),
  field: z.enum(DIRECTORY_FORM_FIELDS).nullable(),
});
export type DirectoryError = z.infer<typeof errorSchema>;

export const reviewOtpResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("otp_sent"), otpId: z.uuid(), expiresInSeconds: z.number().int(), phoneHint: z.string() }),
  /** A recognised visitor (`visitorToken`): published at once, no code. */
  z.object({ status: z.literal("published"), visitor: visitorSessionSchema }),
  errorSchema,
]);
export type ReviewOtpResponse = z.infer<typeof reviewOtpResponseSchema>;

export const reviewConfirmResponseSchema = z.discriminatedUnion("status", [
  /** `visitor` is the account the confirmed number now has, for the website to remember. */
  z.object({ status: z.literal("published"), visitor: visitorSessionSchema.optional() }),
  errorSchema,
]);
export type ReviewConfirmResponse = z.infer<typeof reviewConfirmResponseSchema>;

export const enquiryResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("received"), visitor: visitorSessionSchema.optional() }),
  errorSchema,
]);
export type EnquiryResponse = z.infer<typeof enquiryResponseSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Review actions (added 2026-10-08). A visitor can mark a published review Helpful (once a week per visitor address,
// nothing stored about the visitor), or comment on it: the comment waits for the same texted code as a review
// (`/comments/otp` answers like `/reviews/otp`, `/comments/confirm` like `/reviews/confirm`).
// ---------------------------------------------------------------------------------------------------------------

export const reviewHelpfulRequestSchema = z.object({ reviewId: z.uuid(), clientIp: clientIpSchema });
export type ReviewHelpfulRequest = z.infer<typeof reviewHelpfulRequestSchema>;

/** `counted` also answers a visitor who had already marked it: `helpful` is the review's count either way. */
export const reviewHelpfulResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("counted"), helpful: z.number().int().min(0) }),
  errorSchema,
]);
export type ReviewHelpfulResponse = z.infer<typeof reviewHelpfulResponseSchema>;

export const commentOtpRequestSchema = z.object({
  reviewId: z.uuid(),
  text: z.string().max(2000),
  name: z.string().max(200),
  phone: phoneEntrySchema,
  /** Honeypot: a person never fills it. */
  website: z.string().max(2000),
  clientIp: clientIpSchema,
  visitorToken: visitorTokenSchema,
  noticeVersion: noticeVersionSchema,
  adult: adultSchema,
});
export type CommentOtpRequest = z.infer<typeof commentOtpRequestSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Owner replies (added 2026-10-12). The business's verified owner answers a review from its page. Unlike everything
// above, the caller is the owner's own browser, not the website's server: the website cannot sign anyone in, so the
// page calls these routes directly with the dashboard's session cookie (credentials: "include") and the platform decides
// who the caller is and whether the business is theirs. Only the website's own origin may call them (CORS), and a
// request that is not JSON is refused. Every route answers `{ status: "error", ... }` like the rest of the contract.
// ---------------------------------------------------------------------------------------------------------------

/** `GET ?id=<place id>` or `?key=<listing key>`: whether the signed-in caller is this business's verified owner. */
export const OWNER_ACCESS_PATH = "/api/directory-owner/access";
/** `POST` (post), `PATCH` (edit) and `DELETE` (take down) an owner's answer. */
export const OWNER_REPLIES_PATH = "/api/directory-owner/replies";

/**
 * `GET`: the signed-in dashboard account as a website visitor, so a form on the website does not ask for a name and a
 * number the account already holds. `visitor` is null for a caller who is not signed in and for an account that signs in
 * with an email (it holds no number a code has proven). Same rules as the owner routes: only the website's origin.
 */
export const VISITOR_HANDOFF_PATH = "/api/directory-account/visitor";

/** The most an owner's answer may be; a visitor's comment stays at COMMENT_TEXT_MAX_LENGTH. Must match DIRECTORY_OWNER_REPLY_MAX in packages/db. */
export const OWNER_REPLY_TEXT_MAX_LENGTH = 500;

export const visitorHandoffResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), visitor: visitorSessionSchema.nullable() }),
  errorSchema,
]);
export type VisitorHandoffResponse = z.infer<typeof visitorHandoffResponseSchema>;

export const ownerAccessResponseSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("ok"), owner: z.boolean() }), errorSchema]);
export type OwnerAccessResponse = z.infer<typeof ownerAccessResponseSchema>;

export const ownerReplyPostRequestSchema = z.object({ reviewId: z.uuid(), text: z.string().max(5000) });
export type OwnerReplyPostRequest = z.infer<typeof ownerReplyPostRequestSchema>;

export const ownerReplyEditRequestSchema = z.object({ commentId: z.uuid(), text: z.string().max(5000) });
export type OwnerReplyEditRequest = z.infer<typeof ownerReplyEditRequestSchema>;

export const ownerReplyRemoveRequestSchema = z.object({ commentId: z.uuid() });
export type OwnerReplyRemoveRequest = z.infer<typeof ownerReplyRemoveRequestSchema>;

/**
 * What a post, an edit or a take-down answers. A saved answer carries the same fields as a public comment, minus the
 * name, which the page signs with the business's own. `invalid` points at `text`; `signed_out` is a caller who is not
 * signed in, `unavailable` one who is not this business's verified owner (or whose review or answer is gone), `limited`
 * one answering too fast.
 */
export const ownerReplyResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("saved"),
    reply: z.object({ id: z.string(), text: z.string(), createdAt: z.string(), edited: z.boolean() }),
  }),
  z.object({ status: z.literal("removed") }),
  errorSchema,
]);
export type OwnerReplyResponse = z.infer<typeof ownerReplyResponseSchema>;

/**
 * `POST` from the platform to the website, with the same shared secret as every other call between them (`Authorization:
 * Bearer <LEADS_API_TOKEN>`): a business's page changed on the platform (an owner answered a review), so the website
 * drops what it kept about it and the next visitor sees the change at once, not up to 15 minutes later. `id` is the
 * business's permanent id, or its listing key when it has none. Answers 204; any failure only means the page catches
 * up on its own schedule.
 */
export const DIRECTORY_REFRESH_PATH = "/api/directory-refresh";
export const directoryRefreshRequestSchema = z.object({ id: z.string().min(1).max(200) });
export type DirectoryRefreshRequest = z.infer<typeof directoryRefreshRequestSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Verified businesses (added 2026-09-29). A business is verified once Firstfold has confirmed its name, address and
// phone number (a call, or because it is a client). Verified is also the only way a phone number reaches the site.
// ---------------------------------------------------------------------------------------------------------------

export const DIRECTORY_STATUS_PATH = "/api/directory/status";

export const listingStatusSchema = z.object({
  /** ISO 8601: when Firstfold confirmed the details. */
  verifiedAt: z.string(),
  /** The confirmed number, E.164, or null when the business asked for its number not to be shown. */
  phone: z.string().regex(/^\+[0-9]{8,15}$/).nullable(),
  /** The owner's own square photo, as a picture id (see "Pictures" below); null or absent shows the category's drawing. */
  photo: z.uuid().nullable().optional(),
  /** The business's own website, as the owner who claimed the listing gave it (an http(s) URL); null or absent for none. */
  website: z.string().max(300).nullable().optional(),
  /**
   * True when Firstfold staff granted the Trusted tag directly (added 2026-10-12). The website also earns Trusted from a
   * licence on the profile, so false or absent here does not mean untrusted.
   */
  trusted: z.boolean().optional(),
});
export type ListingStatus = z.infer<typeof listingStatusSchema>;

/** `GET /api/directory/status?keys=k1,k2` or `?ids=i1,i2` (up to MAX_RATING_KEYS together): only verified businesses
 * are included, keyed by the id or key they were asked by. */
export const statusResponseSchema = z.object({ statuses: z.record(z.string(), listingStatusSchema) });
export type StatusResponse = z.infer<typeof statusResponseSchema>;


// ---------------------------------------------------------------------------------------------------------------
// Listing tags (added 2026-09-29). Two are earned from data and never sold: "Popular" (ratings) and "Trending" (views
// and contact taps). Three are paid weekly by the business (built later, with the customer Listing menu).
// ---------------------------------------------------------------------------------------------------------------

/** Popular: earned from reviews on Firstfold. Worked out by the website from the rating summary. */
export const POPULAR_MIN_AVERAGE = 4.0;
export const POPULAR_MIN_REVIEWS = 5;

/** Trending: earned from interest in the last 7 days, worked out by the platform (see signalsResponseSchema). */
export const TRENDING_MIN_SCORE = 20;
export const TRENDING_MIN_GROWTH = 1.5;
/** A contact tap (call, WhatsApp, enquire, directions, website) counts this many times a page view. */
export const TRENDING_CONTACT_WEIGHT = 3;

export const EARNED_TAGS = [
  { id: "popular", label: "Popular" },
  { id: "trending", label: "Trending" },
] as const;

export const PAID_TAGS = [
  { id: "hot_new", label: "Hot & New" },
  { id: "most_searched", label: "Most Searched" },
  { id: "popular_near_you", label: "Popular Near You" },
] as const;

export type EarnedTagId = (typeof EARNED_TAGS)[number]["id"];
export type PaidTagId = (typeof PAID_TAGS)[number]["id"];

export const DIRECTORY_EVENTS_PATH = "/api/directory/events";
export const DIRECTORY_SIGNALS_PATH = "/api/directory/signals";

/** `share`: the visitor shared the business's profile. Counted for the ranking (listingSignalsSchema's `shares`), never for Trending. */
export const DIRECTORY_EVENT_KINDS = ["view", "call", "whatsapp", "enquire", "directions", "website", "share"] as const;
export type DirectoryEventKind = (typeof DIRECTORY_EVENT_KINDS)[number];

/** `POST /api/directory/events`: one visitor action on one business. The platform keeps only daily counts per
 * business and kind; `clientIp` is used (hashed) to count a visitor once per business, kind and day, then dropped. */
export const directoryEventRequestSchema = z
  .object({
    /** The business, by its listing key or (`id`) its permanent id: exactly one of the two. */
    key: listingKeySchema.optional(),
    id: placeIdSchema.optional(),
    kind: z.enum(DIRECTORY_EVENT_KINDS),
    clientIp: z.string().min(1).max(64),
  })
  .refine(namesOneBusiness, ONE_BUSINESS_MESSAGE);
export type DirectoryEventRequest = z.infer<typeof directoryEventRequestSchema>;

export const directoryEventResponseSchema = z.object({ status: z.literal("counted") });

export const PAID_TAG_IDS = PAID_TAGS.map((tag) => tag.id) as [PaidTagId, ...PaidTagId[]];
export const paidTagIdSchema = z.enum(PAID_TAG_IDS);
/** Shown after every paid tag ("Most Searched · Ad"): paid placement is always disclosed (ASCI). */
export const PAID_TAG_MARKER = "Ad";

/** `GET /api/directory/signals?keys=k1,k2` or `?ids=i1,i2` (up to MAX_RATING_KEYS together): only businesses with a
 * signal are included, keyed by the id or key they were asked by. A
 * business may carry both an earned signal (trending) and a paid tag it is currently paying for (null or absent when
 * none — an older platform leaves the field out). `shares` is how many times its profile was ever shared (absent is
 * none, and so is an older platform's answer); a business shared but not trending still gets an entry. */
export const listingSignalsSchema = z.object({
  trending: z.boolean(),
  paidTag: paidTagIdSchema.nullable().optional(),
  shares: z.number().int().min(0).optional(),
});
export type ListingSignals = z.infer<typeof listingSignalsSchema>;
export const signalsResponseSchema = z.object({ signals: z.record(z.string(), listingSignalsSchema) });
export type SignalsResponse = z.infer<typeof signalsResponseSchema>;


// ---------------------------------------------------------------------------------------------------------------
// Ads (added 2026-09-30). Businesses bid weekly for a market's ad spots: one category in one area, e.g. dentists in
// Naupada (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md). The `top` ad is the list's first row;
// the `side` ads fill the side column's spots. Every ad is shown with the "Ad" marker.
// ---------------------------------------------------------------------------------------------------------------

export const DIRECTORY_ADS_PATH = "/api/directory/ads";
/** On the dashboard host: `?listing=<key>` or `?id=<placeId>`, with `&name=<business name>`, opens the free listing sign-up for that listing. */
export const DIRECTORY_JOIN_PATH = "/join";

/**
 * A claim link is made by the website's server and carries a signature over the business and its name, keyed with the
 * shared secret (LEADS_API_TOKEN): HMAC-SHA256, base64url, of claimSignaturePayload(). The dashboard refuses a claim
 * whose signature does not match, so the name a claim is made under is always the one the directory shows for that
 * business, never one typed into the address bar. The business is named by exactly one of:
 *   - `listing=<key>`, the business's listing key (`<service>/<city>/<area>/<slug>`), as before permanent ids;
 *   - `id=<placeId>`, its permanent id (PLACE_ID_PATTERN), the way links are made once the website sends ids.
 * `/join?id=<placeId>&name=<name>&sig=<signature>`. A link with both, or with neither, is refused. The signature is
 * over the same string either way: the key or the id takes the one position the business has in the payload. A key
 * contains slashes and an id never does, so a signature for one can never be taken for the other.
 */
export const DIRECTORY_CLAIM_SIGNATURE_PARAM = "sig";
/** A claim link's business, when it is named by its permanent id rather than by `listing` (its listing key). */
export const DIRECTORY_CLAIM_ID_PARAM = "id";

/** The name as both sides sign and show it: one line, single spaces, at most 200 characters. */
export function claimedBusinessName(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * What the signature covers: the line `claim`, then the business (the listing key, or the place id), then the name,
 * joined by single line feeds, no trailing one. `business` is the key or the id exactly as it appears in the link,
 * and `name` must already be claimedBusinessName(). For the place id 7b3k9mq and the name "Smile Dental":
 * `claim\n7b3k9mq\nSmile Dental`.
 */
export function claimSignaturePayload(business: string, name: string): string {
  return `claim\n${business}\n${name}`;
}
/** Shown on every ad, like PAID_TAG_MARKER. */
export const DIRECTORY_AD_MARKER = "Ad";
export const DIRECTORY_SIDE_AD_SPOTS = 2;
/** How many tiles the home page's ad grid has. */
export const DIRECTORY_HOME_AD_SPOTS = 4;
export const AD_TAGLINE_MAX_LENGTH = 80;

/** `<category>/<city>/<area>`: the first three segments of a listing key. */
export const AD_MARKET_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){2}$/;
export const adMarketSchema = z.string().max(160).regex(AD_MARKET_PATTERN);

/** The longest web address a link ad may lead to. */
export const AD_LINK_MAX_LENGTH = 500;
/** An http or https address with no spaces, as a link ad's destination. */
export const AD_LINK_PATTERN = /^https?:\/\/[^\s]+$/;
export const adLinkSchema = z.string().min(12).max(AD_LINK_MAX_LENGTH).regex(AD_LINK_PATTERN);

export const directoryAdSchema = z.object({
  /**
   * Which spot of its placement the ad holds, from 1 (the home page has four, the side column two). The website puts
   * the ad in that tile, so a spot nobody holds stays free; absent from an older platform, whose ads the website
   * places in the order they come.
   */
  spot: z.int().min(1).max(DIRECTORY_HOME_AD_SPOTS).optional(),
  /**
   * The advertiser's listing: its page is where the ad leads. A link ad has no listing: its key names only its market
   * (its category, city and area, then `link-ad`), so a website that does not know `link` finds no business behind it
   * and leaves the ad out.
   */
  key: listingKeySchema,
  /**
   * Where a link ad leads, set by staff: the ad's own headline and line, and this address, in place of a business's
   * page. Absent or null for an ad for a business; absent from an older platform.
   */
  link: adLinkSchema.nullable().optional(),
  /** The advertiser's permanent id; null for a business that has none yet, absent from an older platform. */
  id: placeIdSchema.nullable().optional(),
  name: z.string().min(1).max(200),
  /** The advertiser's one line, once Firstfold has approved it; null shows the category's own line. */
  tagline: z.string().min(1).max(AD_TAGLINE_MAX_LENGTH).nullable(),
  /** The advertiser's own pictures, as picture ids (see "Pictures" below); absent from an older platform. */
  pictures: z
    .object({
      /** The square listing photo, for the sponsored first row; null shows the category's drawing. */
      photo: z.uuid().nullable(),
      /** The ad picture cut for side spot 1 (8 : 9) and side spot 2 (8 : 5); null shows the category's stock photo. */
      tall: z.uuid().nullable(),
      wide: z.uuid().nullable(),
    })
    .optional(),
});
export type DirectoryAd = z.infer<typeof directoryAdSchema>;

/**
 * `GET /api/directory/ads?market=dentists/thane/naupada`: this week's paid ads in that category and area, in spot
 * order: the list's `top` row and `side` pictures, and the `profile` spot shown on every business page in that market.
 * The home page's ads are the market `all/thane/all` (a city's "all" market): only its `home` tiles are ever filled.
 * `profile` and `home` are absent from an older platform's answer, which is the same as none.
 */
export const adsResponseSchema = z.object({
  top: directoryAdSchema.nullable(),
  side: z.array(directoryAdSchema).max(DIRECTORY_SIDE_AD_SPOTS),
  profile: directoryAdSchema.nullable().optional(),
  home: z.array(directoryAdSchema).max(DIRECTORY_HOME_AD_SPOTS).optional(),
});
export type AdsResponse = z.infer<typeof adsResponseSchema>;

/** The market that holds a city's home page ads: `<HOME_AD_MARKET_SLUG>/<city>/<HOME_AD_MARKET_SLUG>`. */
export const HOME_AD_MARKET_SLUG = "all";

/** Where an ad shows. Must match DIRECTORY_AD_PLACEMENTS in @firstfold/db (directory-parity.test.ts checks). */
export const DIRECTORY_AD_PLACEMENTS = ["top", "side", "profile", "home"] as const;
export type DirectoryAdPlacement = (typeof DIRECTORY_AD_PLACEMENTS)[number];

/** What a visitor did with an ad: saw it on the page, or followed it. Must match DIRECTORY_AD_EVENT_KINDS in @firstfold/db. */
export const DIRECTORY_AD_EVENT_KINDS = ["impression", "click"] as const;
export type DirectoryAdEventKind = (typeof DIRECTORY_AD_EVENT_KINDS)[number];

export const DIRECTORY_AD_EVENTS_PATH = "/api/directory/ad-events";

/**
 * `POST /api/directory/ad-events`: one visitor saw or clicked one business's ad on one placement. `id` is the
 * advertiser's permanent id, as the ads answer gave it. The platform counts it only while that business's ad is running
 * on that placement, once per visitor, ad, placement, kind and day, and keeps only daily counts; `clientIp` is used
 * (hashed) for that, then dropped. Answered 202 "counted" whatever happened to it, like the other events.
 */
export const directoryAdEventRequestSchema = z.object({
  id: placeIdSchema,
  placement: z.enum(DIRECTORY_AD_PLACEMENTS),
  kind: z.enum(DIRECTORY_AD_EVENT_KINDS),
  clientIp: z.string().min(1).max(64),
});
export type DirectoryAdEventRequest = z.infer<typeof directoryAdEventRequestSchema>;


// ---------------------------------------------------------------------------------------------------------------
// Pictures (added 2026-09-30). A listing's owner uploads a square listing photo and an ad picture, each cropped to the
// layout's shape and approved by Firstfold before it shows (docs/superpowers/specs/2026-09-30-listing-pictures-crop-
// design.md). The status and ads answers above name a picture by its id; the file is read here.
// ---------------------------------------------------------------------------------------------------------------

/** `GET /api/directory/pictures/<id>`: the image itself (WebP), or 404 for a picture that is not approved or is gone.
 * An id names one file for ever: a replaced picture gets a new id. */
export const DIRECTORY_PICTURES_PATH = "/api/directory/pictures";
/** The stored size of each shape, in pixels, for the website's width and height attributes. */
export const DIRECTORY_PICTURE_SIZES = {
  photo: { width: 640, height: 640 },
  tall: { width: 960, height: 1080 },
  wide: { width: 960, height: 600 },
} as const;


// ---------------------------------------------------------------------------------------------------------------
// Gallery (added 2026-10-07). A business's page shows the owner's gallery photos (at most twenty, every owner) and short
// videos (at most three of at most 16 seconds, Premium members only), see docs/superpowers/specs/2026-10-07-business-
// videos-design.md. A video is live as soon as its owner has uploaded it (Firstfold can take one down) and is hosted
// (unlisted) on Vimeo, played in Vimeo's embedded player.
// ---------------------------------------------------------------------------------------------------------------

/** `GET /api/directory/gallery?ids=<placeId,…>&keys=<listingKey,…>` (together up to MAX_RATING_KEYS): only a business
 * with at least one photo or video is included, under the id or key it was asked by. */
export const DIRECTORY_GALLERY_PATH = "/api/directory/gallery";
export const MAX_GALLERY_PHOTOS = 20;
export const MAX_GALLERY_VIDEOS = 3;

/** The one host a video plays from: Vimeo's embedded player. */
const VIMEO_PLAYER_HOST = "player.vimeo.com";
/** The one host a video's still comes from. */
const VIMEO_POSTER_HOST = "i.vimeocdn.com";
const VIMEO_EMBED_PATH = /^\/video\/\d+$/;

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    // No credentials and no port: `https://player.vimeo.com@evil.example/` and look-alikes never pass.
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" ? url : null;
  } catch {
    return null;
  }
}

/** Whether `value` is an https address of Vimeo's player for one video: `https://player.vimeo.com/video/<digits>?…`. */
function isVimeoEmbedUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  return url !== null && url.hostname === VIMEO_PLAYER_HOST && VIMEO_EMBED_PATH.test(url.pathname);
}

/** Whether `value` is an https address on Vimeo's picture host. */
function isVimeoPosterUrl(value: string): boolean {
  return parseHttpsUrl(value)?.hostname === VIMEO_POSTER_HOST;
}

export const galleryVideoSchema = z.object({
  id: z.uuid(),
  /** Vimeo player address with the privacy hash and options already in its query (the hash is absent for a public video).
   * The page frames it only after the visitor presses play. */
  embed: z.url().refine(isVimeoEmbedUrl, { error: "must be https://player.vimeo.com/video/<id>" }),
  /** A still from the video on Vimeo's picture host, drawn before it is played. */
  poster: z.url().refine(isVimeoPosterUrl, { error: "must be an https URL on i.vimeocdn.com" }),
  /** The length in seconds, as measured by the platform (at most 16.5). */
  seconds: z.number().positive().max(600),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The owner chose this one for the mosaic at the top of the page; at most one video of a business is. */
  featured: z.boolean().default(false),
});
export type GalleryVideo = z.infer<typeof galleryVideoSchema>;

export const galleryEntrySchema = z.object({
  /** Picture ids in the owner's order (960 x 720 WebP), read through the picture route ("Pictures" below). */
  photos: z.array(z.uuid()).max(MAX_GALLERY_PHOTOS),
  /** In slot order. */
  videos: z.array(galleryVideoSchema).max(MAX_GALLERY_VIDEOS),
});
export type GalleryEntry = z.infer<typeof galleryEntrySchema>;

export const galleryResponseSchema = z.object({ galleries: z.record(z.string(), galleryEntrySchema) });
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;
