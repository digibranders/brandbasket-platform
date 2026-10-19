import "server-only";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import { requiredEmail } from "@brandbasket/shared/lib/validation/contact";
import { websiteOriginAllowed } from "@/lib/owner-replies";
import {
  REQUEST_DETAILS_MAX_LENGTH,
  REQUEST_NAME_MAX_LENGTH,
  type PrivacyRequestField,
  type PrivacyRequestOtpRequest,
} from "@/lib/privacy-requests-api";

const EMAIL_MISSING_MESSAGE = "Enter the email address we should send the code to.";
const NAME_TOO_LONG_MESSAGE = `Keep your name to ${REQUEST_NAME_MAX_LENGTH} characters.`;
const DETAILS_MISSING_MESSAGE = "Tell us what you would like changed, or what has gone wrong.";
const REPORT_MISSING_MESSAGE = "Tell us what is wrong with it.";
const LISTING_MISSING_MESSAGE = "Tell us which listing, and what is wrong with it.";
const DETAILS_TOO_LONG_MESSAGE = `Keep it to ${REQUEST_DETAILS_MAX_LENGTH} characters.`;

/** A correction, a grievance or a report means nothing without the words; for the other kinds the choice itself says it. */
const KINDS_NEEDING_DETAILS: ReadonlySet<string> = new Set(["correction", "grievance", "content_report"]);

/**
 * The page a request is about, if the request names one: only an address on the website's own origin, so staff never open
 * a link someone else chose. fynix.digital sends visitors on to www.fynix.digital, so both count (websiteOriginAllowed).
 * Undefined for none, null for one that is not the website's.
 */
export function requestAbout(raw: string | undefined, websiteOrigin: string): string | null | undefined {
  if (raw === undefined) return undefined;
  try {
    const url = new URL(raw);
    return websiteOriginAllowed(url.origin, websiteOrigin) ? url.href : null;
  } catch {
    return null;
  }
}

export interface PrivacyRequestInput {
  readonly kind: PrivacyRequestOtpRequest["kind"];
  readonly name: string | null;
  /** Trimmed and lowercased: the address the code is emailed to. */
  readonly email: string;
  readonly details: string | null;
  readonly noticeVersion: string | null;
}

export type PrivacyRequestFieldResult =
  | { readonly success: true; readonly data: PrivacyRequestInput }
  | { readonly success: false; readonly field: PrivacyRequestField; readonly message: string };

/**
 * What the request form said, cleaned and checked, or the one thing to put right. `about` is the page the request is about,
 * already checked by `requestAbout`; it goes at the top of the details staff read.
 */
export function parsePrivacyRequestFields(request: PrivacyRequestOtpRequest, about?: string): PrivacyRequestFieldResult {
  const email = requiredEmail(EMAIL_MISSING_MESSAGE).safeParse(request.email);
  if (!email.success) return { success: false, field: "email", message: email.error.issues[0]?.message ?? EMAIL_MISSING_MESSAGE };

  const name = cleanLine(request.name);
  if (Array.from(name).length > REQUEST_NAME_MAX_LENGTH) return { success: false, field: "name", message: NAME_TOO_LONG_MESSAGE };

  const details = cleanMultiline(request.details);
  if (Array.from(details).length > REQUEST_DETAILS_MAX_LENGTH) return { success: false, field: "details", message: DETAILS_TOO_LONG_MESSAGE };
  if (details === "" && KINDS_NEEDING_DETAILS.has(request.kind)) {
    return { success: false, field: "details", message: request.kind === "content_report" ? REPORT_MISSING_MESSAGE : DETAILS_MISSING_MESSAGE };
  }
  // A listing complaint from a listing's own link names the listing; from the form alone, the words have to.
  if (details === "" && about === undefined && request.kind === "listing_removal") return { success: false, field: "details", message: LISTING_MISSING_MESSAGE };

  return {
    success: true,
    data: {
      kind: request.kind,
      name: name === "" ? null : name,
      email: email.data,
      details: withAbout(details, about),
      noticeVersion: request.noticeVersion ?? null,
    },
  };
}

/** What staff read: the page the request is about, then what the person wrote. Null when there is neither. */
function withAbout(details: string, about: string | undefined): string | null {
  if (about === undefined) return details === "" ? null : details;
  return details === "" ? `About: ${about}` : `About: ${about}\n\n${details}`;
}
