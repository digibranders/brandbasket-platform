import "server-only";
import type { ContributionConsent, DirectoryNamed } from "@brandbasket/db";
import { parsePhoneEntry, type PhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import {
  COMMENT_TEXT_MAX_LENGTH,
  ENQUIRY_MESSAGE_MAX_LENGTH,
  MAX_HIGHLIGHTS_PER_REVIEW,
  REVIEW_HIGHLIGHT_IDS,
  REVIEW_TEXT_MAX_LENGTH,
  REVIEWER_NAME_MAX_LENGTH,
  type CommentOtpRequest,
  type DirectoryFormField,
  type EnquiryRequest,
  type ReviewHighlightId,
  type ReviewOtpRequest,
} from "@/lib/directory-api";

/**
 * What a visitor typed into the directory's review and enquiry forms, checked the way the forms themselves describe
 * it (docs/superpowers/specs/2026-09-29-directory-reviews-enquiries-design.md). The request's shape has already been
 * checked against the contract (lib/directory-api.ts); this is the part a person can get wrong, so every refusal
 * names the field to point them at.
 */

export const NAME_MISSING_MESSAGE = "Enter your name.";
export const NAME_TOO_LONG_MESSAGE = `Keep your name to ${REVIEWER_NAME_MAX_LENGTH} characters.`;
export const PHONE_MISSING_MESSAGE = "Enter your mobile number.";
export const TEXT_TOO_LONG_MESSAGE = `Keep your review to ${REVIEW_TEXT_MAX_LENGTH} characters.`;
export const HIGHLIGHT_UNKNOWN_MESSAGE = "Choose highlights from the list.";
export const TOO_MANY_HIGHLIGHTS_MESSAGE = `Pick up to ${MAX_HIGHLIGHTS_PER_REVIEW} highlights.`;
export const MESSAGE_TOO_LONG_MESSAGE = `Keep your message to ${ENQUIRY_MESSAGE_MAX_LENGTH} characters.`;
export const COMMENT_MISSING_MESSAGE = "Write your comment.";
export const COMMENT_TOO_LONG_MESSAGE = `Keep your comment to ${COMMENT_TEXT_MAX_LENGTH} characters.`;
/** Posting is for adults only (DPDP Act s.9: a child's data needs a parent's verifiable consent, which Fynix does not collect). */
export const ADULT_REVIEW_MESSAGE = "Confirm you’re 18 or over to post a review.";
export const ADULT_COMMENT_MESSAGE = "Confirm you’re 18 or over to post a comment.";
/** For a value the website itself supplies (business name, labels, the kind of enquiry): the visitor cannot fix it,
 * only reload the page. */
export const PAGE_PROBLEM_MESSAGE = "Something went wrong with this page. Refresh it and try again.";
/** For an id that names no business on the platform: the website's listings are ahead of, or behind, the platform's. */
export const UNKNOWN_BUSINESS_MESSAGE = "We couldn't find this business. Refresh the page and try again.";

/** Mirrors directory_enquiries_name_check: an enquirer's name follows the same limit as a reviewer's. */
const ENQUIRER_NAME_MAX_LENGTH = REVIEWER_NAME_MAX_LENGTH;
/** Mirrors the business_name, service_label and area_label CHECKs (0054). */
const BUSINESS_NAME_MAX_LENGTH = 200;
const LABEL_MAX_LENGTH = 120;

export type FieldRefusal = { readonly success: false; readonly field: DirectoryFormField | null; readonly message: string };
export type FieldResult<T> = { readonly success: true; readonly data: T } | FieldRefusal;

/** The business a request names: by its permanent id, or (until the website has switched) its listing key. */
function namedBusiness(request: { readonly key?: string | null; readonly id?: string | null }): DirectoryNamed | null {
  if (request.id !== undefined && request.id !== null) return { by: "id", id: request.id };
  if (request.key !== undefined && request.key !== null) return { by: "key", key: request.key };
  return null;
}

export interface ReviewInput {
  readonly business: DirectoryNamed;
  readonly businessName: string;
  readonly rating: number;
  /** Null when the visitor wrote nothing. */
  readonly text: string | null;
  /** Distinct, from the fixed list, at most two, in the order picked. */
  readonly highlights: readonly ReviewHighlightId[];
  readonly name: string;
  /** E.164. */
  readonly phone: string;
  /** What the reviewer agreed to on the form; absent from a site that does not send the notice version yet. */
  readonly consent?: ContributionConsent;
  /** The reviewer ticked that the business may contact them about this review (N14). */
  readonly ownerContact: boolean;
}

/** Who a request is from when they are a recognised visitor: their name and verified number replace whatever the form carried. */
export interface VisitorIdentity {
  readonly name: string;
  /** E.164. */
  readonly phone: string;
}

function refuse(field: DirectoryFormField | null, message: string): FieldRefusal {
  return { success: false, field, message };
}

function isHighlightId(value: string): value is ReviewHighlightId {
  return (REVIEW_HIGHLIGHT_IDS as readonly string[]).includes(value);
}

/** Counts characters as a person does (code points), the way Postgres's char_length does. */
function length(value: string): number {
  return Array.from(value).length;
}

function parseName(raw: string, maxLength: number): FieldResult<string> {
  const name = cleanLine(raw);
  if (name === "") return refuse("name", NAME_MISSING_MESSAGE);
  if (length(name) > maxLength) return refuse("name", NAME_TOO_LONG_MESSAGE);
  return { success: true, data: name };
}

function parsePhone(entry: PhoneEntry): FieldResult<string> {
  const parsed = parsePhoneEntry(entry, PHONE_MISSING_MESSAGE);
  if (!parsed.success) return refuse(parsed.part === "country" ? "phoneCountry" : "phone", parsed.message);
  if (parsed.e164 === null) return refuse("phone", PHONE_MISSING_MESSAGE);
  return { success: true, data: parsed.e164 };
}

/** A website-supplied single-line value: required, and within `maxLength` once cleaned. */
function parsePageValue(raw: string, maxLength: number): FieldResult<string> {
  const value = cleanLine(raw);
  if (value === "" || length(value) > maxLength) return refuse(null, PAGE_PROBLEM_MESSAGE);
  return { success: true, data: value };
}

/** Optional free text: blank is null, otherwise at most `maxLength` characters after trimming. */
function parseOptionalText(raw: string, maxLength: number, field: DirectoryFormField, tooLong: string): FieldResult<string | null> {
  const text = cleanMultiline(raw);
  if (text === "") return { success: true, data: null };
  if (length(text) > maxLength) return refuse(field, tooLong);
  return { success: true, data: text };
}

function parseHighlights(raw: readonly string[]): FieldResult<readonly ReviewHighlightId[]> {
  const picked: ReviewHighlightId[] = [];
  for (const value of raw) {
    if (!isHighlightId(value)) return refuse("highlights", HIGHLIGHT_UNKNOWN_MESSAGE);
    if (!picked.includes(value)) picked.push(value);
  }
  if (picked.length > MAX_HIGHLIGHTS_PER_REVIEW) return refuse("highlights", TOO_MANY_HIGHLIGHTS_MESSAGE);
  return { success: true, data: picked };
}

/** The review a visitor asked to publish, or the first thing wrong with it, in the order the form shows fields. */
export function parseReviewFields(request: ReviewOtpRequest, visitor?: VisitorIdentity): FieldResult<ReviewInput> {
  // The contract names exactly one of the two; a request that slipped past it is the page's problem.
  const business = namedBusiness(request);
  if (business === null) return refuse(null, PAGE_PROBLEM_MESSAGE);
  const businessName = parsePageValue(request.businessName, BUSINESS_NAME_MAX_LENGTH);
  if (!businessName.success) return businessName;
  const highlights = parseHighlights(request.highlights);
  if (!highlights.success) return highlights;
  const text = parseOptionalText(request.text, REVIEW_TEXT_MAX_LENGTH, "text", TEXT_TOO_LONG_MESSAGE);
  if (!text.success) return text;
  const name = visitor === undefined ? parseName(request.name, REVIEWER_NAME_MAX_LENGTH) : parseName(visitor.name, REVIEWER_NAME_MAX_LENGTH);
  if (!name.success) return name;
  const phone = visitor === undefined ? parsePhone(request.phone) : ({ success: true, data: visitor.phone } as const);
  if (!phone.success) return phone;
  if (request.adult !== true) return refuse(null, ADULT_REVIEW_MESSAGE);

  return {
    success: true,
    data: {
      business,
      businessName: businessName.data,
      rating: request.rating,
      text: text.data,
      highlights: highlights.data,
      name: name.data,
      phone: phone.data,
      ownerContact: request.ownerContact === true,
      ...consentOf(request),
    },
  };
}

/**
 * What the visitor agreed to, from a review or comment request: the notice version they saw and whether they ticked 18
 * or over. Empty for a request without a notice version, so nothing is recorded for it.
 */
function consentOf(request: { readonly noticeVersion?: string | undefined; readonly adult?: boolean | undefined; readonly ownerContact?: boolean | undefined }): {
  readonly consent?: ContributionConsent;
} {
  if (request.noticeVersion === undefined) return {};
  return {
    consent: {
      noticeVersion: request.noticeVersion,
      adult: request.adult === true,
      ...(request.ownerContact === true ? { ownerContact: true } : {}),
    },
  };
}

export interface CommentInput {
  /** The review commented on: a UUID, checked to be a published review by the code request. */
  readonly reviewId: string;
  readonly name: string;
  readonly text: string;
  /** E.164. */
  readonly phone: string;
  /** What the commenter agreed to on the form; absent from a site that does not send the notice version yet. */
  readonly consent?: ContributionConsent;
}

/** The comment a visitor asked to publish, or the first thing wrong with it, in the order the form shows fields. */
export function parseCommentFields(request: CommentOtpRequest, visitor?: VisitorIdentity): FieldResult<CommentInput> {
  const text = cleanMultiline(request.text);
  if (text === "") return refuse("text", COMMENT_MISSING_MESSAGE);
  if (length(text) > COMMENT_TEXT_MAX_LENGTH) return refuse("text", COMMENT_TOO_LONG_MESSAGE);
  const name = parseName(visitor === undefined ? request.name : visitor.name, REVIEWER_NAME_MAX_LENGTH);
  if (!name.success) return name;
  const phone = visitor === undefined ? parsePhone(request.phone) : ({ success: true, data: visitor.phone } as const);
  if (!phone.success) return phone;
  if (request.adult !== true) return refuse(null, ADULT_COMMENT_MESSAGE);
  return { success: true, data: { reviewId: request.reviewId, name: name.data, text, phone: phone.data, ...consentOf(request) } };
}

type EnquiryTarget =
  | { readonly kind: "business"; readonly business: DirectoryNamed; readonly businessName: string }
  | { readonly kind: "top_list"; readonly business: null; readonly businessName: null };

/** A visitor's enquiry, checked: what recordDirectoryEnquiry stores once it has found the business it names. */
export type EnquiryInput = EnquiryTarget & {
  readonly serviceLabel: string;
  readonly areaLabel: string;
  readonly name: string;
  /** E.164. */
  readonly phone: string;
  readonly message: string | null;
  /** The notice the visitor saw when they sent it; absent from a site that does not send it yet. */
  readonly noticeVersion?: string;
};

/** An enquiry about one business must name it (by key or id, not both, and its name); a "top list" request is about a
 * service and an area and names no business. The website builds both, so a mismatch is a page problem, not the
 * visitor's. */
function parseEnquiryTarget(request: EnquiryRequest): FieldResult<EnquiryTarget> {
  const hasKey = request.key !== undefined && request.key !== null;
  const hasId = request.id !== undefined && request.id !== null;
  if (request.kind === "top_list") {
    const namesBusiness = request.businessName !== null && cleanLine(request.businessName) !== "";
    if (hasKey || hasId || namesBusiness) return refuse(null, PAGE_PROBLEM_MESSAGE);
    return { success: true, data: { kind: "top_list", business: null, businessName: null } };
  }
  const business = namedBusiness(request);
  if (business === null || (hasKey && hasId) || request.businessName === null) return refuse(null, PAGE_PROBLEM_MESSAGE);
  const businessName = parsePageValue(request.businessName, BUSINESS_NAME_MAX_LENGTH);
  if (!businessName.success) return businessName;
  return { success: true, data: { kind: "business", business, businessName: businessName.data } };
}

/** The enquiry a visitor sent, or the first thing wrong with it, in the order the form shows fields. */
export function parseEnquiryFields(request: EnquiryRequest, visitor?: VisitorIdentity): FieldResult<EnquiryInput> {
  const serviceLabel = parsePageValue(request.serviceLabel, LABEL_MAX_LENGTH);
  if (!serviceLabel.success) return serviceLabel;
  const areaLabel = parsePageValue(request.areaLabel, LABEL_MAX_LENGTH);
  if (!areaLabel.success) return areaLabel;
  const target = parseEnquiryTarget(request);
  if (!target.success) return target;
  const name = parseName(visitor === undefined ? request.name : visitor.name, ENQUIRER_NAME_MAX_LENGTH);
  if (!name.success) return name;
  const phone = visitor === undefined ? parsePhone(request.phone) : ({ success: true, data: visitor.phone } as const);
  if (!phone.success) return phone;
  const message = parseOptionalText(request.message, ENQUIRY_MESSAGE_MAX_LENGTH, "message", MESSAGE_TOO_LONG_MESSAGE);
  if (!message.success) return message;

  return {
    success: true,
    data: {
      ...target.data,
      serviceLabel: serviceLabel.data,
      areaLabel: areaLabel.data,
      name: name.data,
      phone: phone.data,
      message: message.data,
      ...(request.noticeVersion === undefined ? {} : { noticeVersion: request.noticeVersion }),
    },
  };
}
