import { PRIVACY_REQUEST_KIND_LABELS, type NewPrivacyRequest, type PrivacyRequestKind, type PrivacyRequestOutcome, type PrivacyRequestProgress } from "@brandbasket/db";
import { requestDeadlines } from "@brandbasket/shared/lib/privacy-request-deadlines";

/** What each kind of request is called on the page, in the same words as the alert emails. */
export const REQUEST_KIND_LABELS: Readonly<Record<PrivacyRequestKind, string>> = PRIVACY_REQUEST_KIND_LABELS;

export const REQUEST_OUTCOME_LABELS: Readonly<Record<PrivacyRequestOutcome, string>> = {
  fulfilled: "Done as asked",
  refused: "Refused",
  withdrawn: "Withdrawn by the person",
};

const CONTACT_MIN_LENGTH = 3;
const CONTACT_MAX_LENGTH = 320;
const NAME_MAX_LENGTH = 200;
const DETAILS_MAX_LENGTH = 4000;
const RESOLUTION_MAX_LENGTH = 2000;

const KIND_MISSING = "Choose what the person is asking for.";
const CONTACT_MISSING = "Enter an email address or phone number to reach the person.";
const CONTACT_TOO_LONG = `Keep the contact to ${CONTACT_MAX_LENGTH} characters.`;
const NAME_TOO_LONG = `Keep the name to ${NAME_MAX_LENGTH} characters.`;
const DETAILS_TOO_LONG = `Keep the details to ${DETAILS_MAX_LENGTH} characters.`;
const TIME_BAD = "Enter when the request was received.";
const TIME_IN_FUTURE = "A request cannot have been received in the future.";
const OUTCOME_MISSING = "Choose how the request ended.";
const RESOLUTION_MISSING = "Say what was done, in a few words.";
const RESOLUTION_TOO_LONG = `Keep it to ${RESOLUTION_MAX_LENGTH} characters.`;

/** Everything the forms can say is wrong, so the page shows a message passed back in the address only if it is one of these. */
export const PRIVACY_REQUEST_FORM_MESSAGES: readonly string[] = [
  KIND_MISSING,
  CONTACT_MISSING,
  CONTACT_TOO_LONG,
  NAME_TOO_LONG,
  DETAILS_TOO_LONG,
  TIME_BAD,
  TIME_IN_FUTURE,
  OUTCOME_MISSING,
  RESOLUTION_MISSING,
  RESOLUTION_TOO_LONG,
];

/** India's offset: the staff who log a request read their own clocks. */
const IST_OFFSET = "+05:30";

type Parsed<T> = { readonly ok: true; readonly input: T } | { readonly ok: false; readonly message: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isKind(value: string): value is PrivacyRequestKind {
  return Object.hasOwn(REQUEST_KIND_LABELS, value);
}

function isOutcome(value: string): value is PrivacyRequestOutcome {
  return Object.hasOwn(REQUEST_OUTCOME_LABELS, value);
}

/**
 * What a "Log a request" form says, checked, or the one thing to put right. This form is for a request that came by email or
 * a call, so the channel is one of those two; the date it was received is the day the clock starts, not the day it is logged.
 */
export function parsePrivacyRequestForm(formData: FormData, now: Date): Parsed<NewPrivacyRequest> {
  const kind = text(formData, "kind");
  if (!isKind(kind)) return { ok: false, message: KIND_MISSING };

  const contact = text(formData, "contact").trim();
  if (contact.length < CONTACT_MIN_LENGTH) return { ok: false, message: CONTACT_MISSING };
  if (contact.length > CONTACT_MAX_LENGTH) return { ok: false, message: CONTACT_TOO_LONG };

  const name = text(formData, "name").trim();
  if (name.length > NAME_MAX_LENGTH) return { ok: false, message: NAME_TOO_LONG };

  const details = text(formData, "details").trim();
  if (details.length > DETAILS_MAX_LENGTH) return { ok: false, message: DETAILS_TOO_LONG };

  const raw = text(formData, "receivedAt").trim();
  const receivedAt = raw === "" ? now : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(`${raw}:00${IST_OFFSET}`) : null;
  if (receivedAt === null || Number.isNaN(receivedAt.getTime())) return { ok: false, message: TIME_BAD };
  if (receivedAt.getTime() > now.getTime()) return { ok: false, message: TIME_IN_FUTURE };

  return {
    ok: true,
    input: {
      kind,
      channel: text(formData, "channel") === "email" ? "email" : "staff",
      subjectName: name === "" ? null : name,
      subjectContact: contact,
      details: details === "" ? null : details,
      receivedAt,
      dueAt: requestDeadlines(receivedAt).dueAt,
    },
  };
}

/** The button pressed on an open request, as the progress it records; "take" is the staff member taking it on themselves. */
export function parsePrivacyRequestProgress(
  formData: FormData,
  now: Date,
  staffUserId: string,
): { readonly ok: true; readonly progress: PrivacyRequestProgress } | { readonly ok: false } {
  switch (text(formData, "do")) {
    case "take":
      return { ok: true, progress: { handledBy: staffUserId } };
    case "verifying":
      return { ok: true, progress: { status: "verifying" } };
    case "identity_checked":
      return { ok: true, progress: { identityVerifiedAt: now, status: "in_progress" } };
    case "in_progress":
      return { ok: true, progress: { status: "in_progress" } };
    default:
      return { ok: false };
  }
}

/** What a "Close" form says: how it ended and what was done, checked, or the one thing to put right. */
export function parsePrivacyRequestClose(formData: FormData): Parsed<{ readonly outcome: PrivacyRequestOutcome; readonly resolution: string }> {
  const outcome = text(formData, "outcome");
  if (!isOutcome(outcome)) return { ok: false, message: OUTCOME_MISSING };
  const resolution = text(formData, "resolution").trim();
  if (resolution === "") return { ok: false, message: RESOLUTION_MISSING };
  if (resolution.length > RESOLUTION_MAX_LENGTH) return { ok: false, message: RESOLUTION_TOO_LONG };
  return { ok: true, input: { outcome, resolution } };
}
