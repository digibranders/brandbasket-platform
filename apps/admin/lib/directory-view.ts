/**
 * Which part of the Directory page is showing, read from and written to its URL, so the page, its filter pills, its
 * paging links and its actions' redirects all agree. `/directory` alone is the new enquiries, page 1.
 *
 * Also the pure half of the Verified tab's form: reading a business's page address on the website into its listing
 * key, and the name and phone into what is stored.
 */
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";

export const DIRECTORY_PAGE_SIZE = 25;

export const DIRECTORY_SECTIONS = ["enquiries", "reviews", "comments", "verified", "visitors"] as const;
export type DirectorySection = (typeof DIRECTORY_SECTIONS)[number];

export const ENQUIRY_FILTERS = ["new", "handled"] as const;
export type EnquiryFilter = (typeof ENQUIRY_FILTERS)[number];

export const REVIEW_FILTERS = ["all", "published", "hidden"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export type DirectoryView =
  | { readonly section: "enquiries"; readonly status: EnquiryFilter; readonly page: number }
  | { readonly section: "reviews"; readonly status: ReviewFilter; readonly page: number }
  /** Comments on reviews: the same filters as the reviews they hang from. */
  | { readonly section: "comments"; readonly status: ReviewFilter; readonly page: number }
  /** `search` is matched against business names; blank lists every verified business. */
  | { readonly section: "verified"; readonly search: string; readonly page: number }
  /** Website visitor accounts; `search` is matched against names and, from six digits, the end of a number. */
  | { readonly section: "visitors"; readonly search: string; readonly page: number };

export const DIRECTORY_NOTICE_KEYS = [
  "handled",
  "hidden",
  "restored",
  "comment_hidden",
  "comment_restored",
  "verified",
  "reverified",
  "trusted_given",
  "trusted_removed",
  "removed",
  "visitor_deleted",
  "confirm_remove",
  "unchanged",
] as const;
export type DirectoryNotice = (typeof DIRECTORY_NOTICE_KEYS)[number];

/** What the page says after an action. Fixed messages only: the query parameter picks one, nothing more. */
export const DIRECTORY_NOTICES: Readonly<Record<DirectoryNotice, { readonly text: string; readonly ok: boolean }>> = {
  handled: { text: "Marked handled.", ok: true },
  hidden: { text: "Review hidden. It no longer counts towards the rating or shows on the website.", ok: true },
  restored: { text: "Review restored. It counts and shows again.", ok: true },
  comment_hidden: { text: "Comment hidden. It no longer shows under the review on the website.", ok: true },
  comment_restored: { text: "Comment restored. It shows under the review again.", ok: true },
  verified: { text: "Verified. The website shows it within a minute.", ok: true },
  reverified: { text: "Already verified, so its name, phone and date were updated.", ok: true },
  trusted_given: { text: "Trusted tag given. The website shows it within a minute.", ok: true },
  trusted_removed: {
    text: "Trusted tag taken away. The website stops showing it within a minute, unless the business lists a licence on its profile.",
    ok: true,
  },
  removed: { text: "Verification removed. The website stops showing the tag and the number within a minute.", ok: true },
  visitor_deleted: { text: "Visitor account deleted. Their browser will ask for the code again next time, and the number can start a new account.", ok: true },
  confirm_remove: { text: "Nothing removed: tick the box to confirm first.", ok: false },
  unchanged: { text: "Nothing changed: someone got there first.", ok: false },
};

/** Pages beyond this are not real use; the cap keeps a hand-typed URL's offset query cheap. */
const MAX_PAGE = 10_000;

type ParamValue = string | readonly string[] | null | undefined;

function first(value: ParamValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? value : value[0];
}

function oneOf<T extends string>(options: readonly T[], value: string | undefined): T | undefined {
  return options.find((option) => option === value);
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return 1;
  return Math.min(Number(raw), MAX_PAGE);
}

/** Longer than any business name; the cap keeps a hand-typed URL's search reasonable. */
const MAX_SEARCH_LENGTH = 200;

function parseSearch(raw: string | undefined): string {
  return Array.from(cleanLine(raw ?? "")).slice(0, MAX_SEARCH_LENGTH).join("");
}

export type DirectoryViewParam = "show" | "status" | "page" | "q";

/** Reads the view from search params (or a posted form's same-named fields); anything unknown falls back to the
 * default rather than failing, since it only chooses what to show. */
export function parseDirectoryView(read: (name: DirectoryViewParam) => ParamValue): DirectoryView {
  const page = parsePage(first(read("page")));
  const status = first(read("status"));
  const show = first(read("show"));
  if (show === "reviews") return { section: "reviews", status: oneOf(REVIEW_FILTERS, status) ?? "all", page };
  if (show === "comments") return { section: "comments", status: oneOf(REVIEW_FILTERS, status) ?? "all", page };
  if (show === "verified") return { section: "verified", search: parseSearch(first(read("q"))), page };
  if (show === "visitors") return { section: "visitors", search: parseSearch(first(read("q"))), page };
  return { section: "enquiries", status: oneOf(ENQUIRY_FILTERS, status) ?? "new", page };
}

export function parseDirectoryNotice(raw: ParamValue): DirectoryNotice | null {
  return oneOf(DIRECTORY_NOTICE_KEYS, first(raw)) ?? null;
}

/** The URL for `view`, leaving defaults out so the plainest view is plain `/directory`. */
export function directoryHref(view: DirectoryView, notice: DirectoryNotice | null = null): string {
  const params = new URLSearchParams();
  switch (view.section) {
    case "enquiries":
      if (view.status !== "new") params.set("status", view.status);
      break;
    case "reviews":
      params.set("show", "reviews");
      if (view.status !== "all") params.set("status", view.status);
      break;
    case "comments":
      params.set("show", "comments");
      if (view.status !== "all") params.set("status", view.status);
      break;
    case "verified":
      params.set("show", "verified");
      if (view.search !== "") params.set("q", view.search);
      break;
    case "visitors":
      params.set("show", "visitors");
      if (view.search !== "") params.set("q", view.search);
      break;
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled directory view: ${JSON.stringify(unhandled)}`);
    }
  }
  if (view.page > 1) params.set("page", String(view.page));
  if (notice !== null) params.set("done", notice);
  const query = params.toString();
  return query === "" ? "/directory" : `/directory?${query}`;
}

/** How many pages `total` rows fill, never fewer than one. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
}

// ---------------------------------------------------------------------------------------------------------------
// Verifying a business
// ---------------------------------------------------------------------------------------------------------------

/** The directory is Maharashtra-only: every business page on the website is /in/<service>/mh/<city>/<area>/<slug>. */
export const DIRECTORY_STATE_CODE = "mh";

/** One lowercase kebab segment, as in the contract's LISTING_KEY_PATTERN (apps/platform/lib/directory-api.ts). */
const LISTING_KEY_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The table's CHECK (0056) and the contract's listingKeySchema. */
const MAX_LISTING_KEY_LENGTH = 200;
const MAX_BUSINESS_NAME_LENGTH = 200;
/** Longer than any real page address; a paste of something else entirely is refused before it is split. */
const MAX_PAGE_ADDRESS_LENGTH = 2000;

function listingKeyOf(segments: readonly string[]): string | null {
  if (!segments.every((segment) => LISTING_KEY_SEGMENT.test(segment))) return null;
  const key = segments.join("/");
  return key.length <= MAX_LISTING_KEY_LENGTH ? key : null;
}

/**
 * The listing key (`<service>/<city>/<area>/<slug>`) of an older business page on the website, from what staff paste: the
 * full address (`https://brandbasket.in/in/restaurants/mh/ambarnath/sarvodaya-nagar/golden-punjab-hotel`, any host,
 * with or without a query, fragment or trailing slash), the bare path (`/in/restaurants/mh/…`, the leading slash
 * optional), or the key itself. Null for anything else, including a list page or a page outside Maharashtra.
 */
export function listingKeyFromPageAddress(raw: string): string | null {
  const text = raw.trim();
  if (text === "" || text.length > MAX_PAGE_ADDRESS_LENGTH) return null;

  const isAddress = /^https?:\/\//i.test(text);
  if (isAddress && !URL.canParse(text)) return null;
  const path = isAddress ? new URL(text).pathname : (text.split(/[?#]/, 1)[0] ?? "");
  const segments = path.split("/").filter((segment) => segment !== "");

  // The key itself, as the console lists it. Never an address or a path: "/in/<service>/mh/<city>" is a list page.
  if (segments.length === 4 && !isAddress && !path.startsWith("/") && segments[0] !== "in") return listingKeyOf(segments);
  if (segments.length !== 6) return null;
  const [prefix, service, state, city, area, slug] = segments;
  if (prefix !== "in" || state !== DIRECTORY_STATE_CODE || service === undefined || city === undefined) return null;
  if (area === undefined || slug === undefined) return null;
  return listingKeyOf([service, city, area, slug]);
}

/** The Verified tab's form fields, by their `name`. */
export const VERIFICATION_FIELDS = ["listing", "businessName", "phone", "phoneCountry"] as const;
export type VerificationField = (typeof VERIFICATION_FIELDS)[number];
/** The Trusted checkbox's `name`: not a text field, so errors never point at it. */
export const TRUSTED_FIELD = "trusted";

/** What was typed (and whether the Trusted box was ticked), echoed back into the form after a refusal. */
export type VerificationValues = Readonly<Record<VerificationField, string>> & { readonly trusted: boolean };

export type VerificationFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly field: VerificationField | null;
      readonly values: VerificationValues;
    };

export interface VerificationInput {
  readonly listingKey: string;
  readonly businessName: string;
  /** E.164, or null for "Don't show a number". */
  readonly phone: string | null;
  /** The Trusted box was ticked. Unticked leaves a business's Trusted tag as it is; taking it away is its own button. */
  readonly trusted: boolean;
}

export type VerificationParseResult =
  | { readonly success: true; readonly data: VerificationInput }
  | { readonly success: false; readonly field: VerificationField; readonly message: string };

export const LISTING_MISSING_MESSAGE = "Paste the address of the business's page on the website.";
export const LISTING_INVALID_MESSAGE =
  "That isn't a business page. It looks like brandbasket.in/in/mh/business/smile-dental/9f94ykmdjp.";
export const BUSINESS_NAME_MISSING_MESSAGE = "Enter the business's name as it should show.";
export const BUSINESS_NAME_TOO_LONG_MESSAGE = `Keep the name to ${MAX_BUSINESS_NAME_LENGTH} characters.`;

/** Every field of a posted form as text: anything missing or not a string (a file) reads as blank. */
export function verificationValuesFrom(read: (name: VerificationField | typeof TRUSTED_FIELD) => unknown): VerificationValues {
  const text = (name: VerificationField): string => {
    const value = read(name);
    return typeof value === "string" ? value : "";
  };
  return {
    listing: text("listing"),
    businessName: text("businessName"),
    phone: text("phone"),
    phoneCountry: text("phoneCountry"),
    // A ticked checkbox posts "on"; an unticked one posts nothing.
    trusted: read(TRUSTED_FIELD) === "on",
  };
}

/**
 * The Verified tab's form, checked field by field in the order they appear, so the first problem is the one pointed
 * at. The phone is optional: blank means the business asked for no number to be shown.
 */
export function parseVerificationForm(values: VerificationValues): VerificationParseResult {
  if (values.listing.trim() === "") return { success: false, field: "listing", message: LISTING_MISSING_MESSAGE };
  const listingKey = listingKeyFromPageAddress(values.listing);
  if (listingKey === null) return { success: false, field: "listing", message: LISTING_INVALID_MESSAGE };

  const businessName = cleanLine(values.businessName);
  if (businessName === "") return { success: false, field: "businessName", message: BUSINESS_NAME_MISSING_MESSAGE };
  // Counted as Postgres's char_length does, in code points.
  if (Array.from(businessName).length > MAX_BUSINESS_NAME_LENGTH) {
    return { success: false, field: "businessName", message: BUSINESS_NAME_TOO_LONG_MESSAGE };
  }

  const phone = parsePhoneEntry({ country: values.phoneCountry, number: values.phone }, null);
  if (!phone.success) return { success: false, field: phone.part === "country" ? "phoneCountry" : "phone", message: phone.message };

  return { success: true, data: { listingKey, businessName, phone: phone.e164, trusted: values.trusted } };
}

/** The listing key a row's Remove form posts, or null when it is not one. */
export function parseListingKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const segments = raw.split("/");
  return segments.length === 4 ? listingKeyOf(segments) : null;
}
