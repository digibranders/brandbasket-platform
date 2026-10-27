import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

/**
 * What happened to a customer's request, in the five words the dashboard uses (Quoted, In progress, Ready to check, Done)
 * plus a reply from the team and the rare "Closed". The totals and dates arrive as text the app has already worked out, so
 * this package holds no pricing rule.
 */
export type ChangeRequestUpdate =
  | { readonly kind: "reply"; readonly body: string }
  | { readonly kind: "quote"; readonly line: string; readonly total: string; readonly workingDays: number; readonly note?: string | null }
  | { readonly kind: "started"; readonly readyBy: string | null }
  | { readonly kind: "ready" }
  | { readonly kind: "done" }
  | { readonly kind: "closed"; readonly reason: string | null };

export interface ChangeRequestUpdateInput {
  readonly to: string;
  /** The person's full name; only the first word is used. */
  readonly name: string;
  /** The request's title, as the list shows it. */
  readonly title: string;
  /** Where "Open your request" goes: the dashboard's Requests page with this request open. */
  readonly requestUrl: string;
  readonly update: ChangeRequestUpdate;
}

const SUBJECT_WORD: Readonly<Record<ChangeRequestUpdate["kind"], string>> = {
  reply: "New reply",
  quote: "Quoted",
  started: "In progress",
  ready: "Ready to check",
  done: "Done",
  closed: "Closed",
};

function sentences(title: string, update: ChangeRequestUpdate): readonly string[] {
  switch (update.kind) {
    case "reply":
      return [`The Brandbasket team replied to "${title}":`];
    case "quote":
      return [`Your quote for "${title}" is ready.`, update.line, `Total: ${update.total}`, `Accept it in your dashboard and it is ready to check ${update.workingDays} working days after you pay.`];
    case "started":
      return [update.readyBy === null ? `We have started on "${title}".` : `We have started on "${title}". It will be ready to check by ${update.readyBy}.`];
    case "ready":
      return [`"${title}" is ready for you to check. Open it and press Looks good, or write back with what to fix.`];
    case "done":
      return [`"${title}" is done. If something is not right, open the request and reopen it.`];
    case "closed":
      return update.reason === null ? [`We could not go ahead with "${title}".`] : [`We could not go ahead with "${title}".`, `Why: ${update.reason}`];
  }
}

/** The email a customer gets when the team replies, quotes, starts, asks them to check, finishes or closes their request. */
export function changeRequestUpdateEmail(input: ChangeRequestUpdateInput): EmailMessage {
  const url = assertWebUrl(input.requestUrl, "requestUrl");
  const first = input.name.trim().split(/\s+/)[0] ?? "";
  const greeting = first === "" ? "Hello," : `Hi ${first},`;
  const lines = sentences(input.title, input.update);
  // A reply carries the team's words; a quote may carry a few of them too.
  const reply = input.update.kind === "reply" ? input.update.body : input.update.kind === "quote" ? (input.update.note ?? null) : null;
  const subject = sanitizeHeaderValue(`${SUBJECT_WORD[input.update.kind]}: ${input.title}`);

  const text = [greeting, "", ...lines, ...(reply === null ? [] : ["", reply]), "", `Open your request: ${url}`];
  const html = [
    escapeHtml(greeting),
    ...lines.map((line) => escapeHtml(line)),
    ...(reply === null ? [] : [`<span style="display:block;padding:12px;background:#efe4d6;border-radius:8px;white-space:pre-wrap">${escapeHtml(reply)}</span>`]),
    `<a href="${escapeHtml(url)}">Open your request</a>`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: `change-request-${input.update.kind}`,
    bodyText: text.join("\n"),
    bodyHtml: htmlDocument(subject, html),
  };
}
