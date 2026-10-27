/** What the client page says after a request action (`?requests=` and `?mail=` in its address). */
export const REQUEST_ACTION_NOTICES = {
  quoted: { ok: true, text: "Quote sent." },
  started: { ok: true, text: "Work started." },
  previewed: { ok: true, text: "Sent for checking." },
  finished: { ok: true, text: "Marked done." },
  declined: { ok: true, text: "Request declined." },
  moved: { ok: false, text: "This request has already moved on. Reload the page to see where it is." },
  "no-included-left": { ok: false, text: "No included edits are left for the month this was sent. Send a quote, or choose No charge." },
  "not-website": { ok: false, text: "Only a website change can use an included edit. Choose No charge, or send a quote." },
  "no-plan": { ok: false, text: "This business has no plan to price a quote from." },
  invalid: { ok: false, text: "Check the form." },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type RequestActionNotice = keyof typeof REQUEST_ACTION_NOTICES;

/** Whether the customer was told by email. A customer who signs in with a phone number has no address. */
export type MailOutcome = "emailed" | "no-email" | "failed";

const MAIL_TEXT: Readonly<Record<MailOutcome, string>> = {
  emailed: "The customer was emailed.",
  "no-email": "They have no email address, so tell them another way.",
  failed: "The email could not be sent. Tell them another way.",
};

export function readRequestActionNotice(value: string | string[] | undefined): RequestActionNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(REQUEST_ACTION_NOTICES, value) ? (value as RequestActionNotice) : null;
}

export function readMailOutcome(value: string | string[] | undefined): MailOutcome | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(MAIL_TEXT, value) ? (value as MailOutcome) : null;
}

/** The line shown above the Requests section: what happened, and for a good result whether the customer was told. */
export function requestActionLine(notice: RequestActionNotice, mail: MailOutcome | null): { readonly ok: boolean; readonly text: string } {
  const base = REQUEST_ACTION_NOTICES[notice];
  return base.ok && mail !== null ? { ok: mail === "emailed", text: `${base.text} ${MAIL_TEXT[mail]}` } : base;
}
