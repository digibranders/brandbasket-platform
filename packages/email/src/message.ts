/** What the database outbox records in place of the full message, for emails whose body must not be stored there. */
export interface EmailOutboxCopy {
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  /**
   * Set when the copy leaves out a link that signs someone in or creates an account. Only the local development inbox
   * may store the full message for these (see OutboxOptions in outbox.ts); everywhere else the link reaches the
   * recipient alone.
   */
  readonly linkWithheld?: true;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  /**
   * Set when the outbox must not hold the full body (support alerts carry customer text, and erasure only deletes
   * outbox rows addressed to the customer). Every transport sends the full message to the recipient, and the outbox
   * stores this copy instead.
   */
  readonly outboxCopy?: EmailOutboxCopy;
}

const HEADER_UNSAFE = /[\r\n\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const WEB_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * Subjects and addresses can become real SMTP headers, where a line break lets the value add headers of its own.
 * The package does not rely on callers having cleaned their input.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(HEADER_UNSAFE, " ").replace(/\s+/g, " ").trim();
}

/** Links in these emails create accounts, so anything but http(s) is refused rather than escaped into an href. */
export function assertWebUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http or https URL`);
  }
  if (!WEB_SCHEMES.has(parsed.protocol)) {
    throw new Error(`${name} must use http or https, received "${parsed.protocol}"`);
  }
  return value;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Values from customers end up in staff inboxes, so everything interpolated into HTML is escaped. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** Wraps body paragraphs in the plain layout both templates share. */
export function htmlDocument(title: string, paragraphs: readonly string[]): string {
  const body = paragraphs
    .map((paragraph) => `    <p style="margin:0 0 16px;overflow-wrap:anywhere">${paragraph}</p>`)
    .join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(title)}</title>`,
    "  </head>",
    '  <body style="margin:0;padding:24px;background:#f6efe6;color:#2a0d10;font-family:system-ui,sans-serif">',
    `    <h1 style="margin:0 0 20px;font-size:20px">${escapeHtml(title)}</h1>`,
    body,
    "  </body>",
    "</html>",
  ].join("\n");
}

const LINK_WITHHELD_NOTE = "The link was sent to the recipient and is not stored here.";
const CODE_WITHHELD_NOTE = "The code was sent to the recipient and is not stored here.";

/**
 * The outbox copy of an email whose link signs someone in: the same subject and wording, without the link. Anyone who
 * can read the outbox could otherwise use the link, and the outbox is kept far longer than any link is valid.
 */
export function withheldLinkCopy(subject: string, paragraphs: readonly string[]): EmailOutboxCopy {
  return withheldSecretCopy(subject, paragraphs, LINK_WITHHELD_NOTE);
}

/**
 * The outbox copy of an email whose one-time code lets someone open an account: the same wording without the code. Like a
 * link, it is flagged so only the local development inbox keeps the whole message (a developer reads the code there).
 */
export function withheldCodeCopy(subject: string, paragraphs: readonly string[]): EmailOutboxCopy {
  return withheldSecretCopy(subject, paragraphs, CODE_WITHHELD_NOTE);
}

function withheldSecretCopy(subject: string, paragraphs: readonly string[], note: string): EmailOutboxCopy {
  return {
    subject,
    bodyText: [...paragraphs, note].join("\n\n"),
    bodyHtml: htmlDocument(subject, [...paragraphs, note].map(escapeHtml)),
    linkWithheld: true,
  };
}
