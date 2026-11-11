import { emailBrandName } from "../brand";
import { sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptDocument, receiptParagraph, receiptQuote } from "../receipt";
import { emailGreeting } from "../format";

/** The most of the customer's words the email repeats back. */
export const CHANGES_QUOTE_LIMIT = 300;

export interface PreviewChangesReceivedInput {
  readonly to: string;
  /** The customer's full name; only the first word is used. Null for a greeting without a name. */
  readonly name: string | null;
  /** The round these changes use, and how many rounds are included. */
  readonly round: number;
  readonly rounds: number;
  /** What the customer wrote. Repeated back shortened to 300 characters. */
  readonly text: string;
  /** The day the new preview is promised, as the customer's Website page words it ("Thu 5 Nov"); null leaves the sentence out. */
  readonly readyBy: string | null;
}

/** The first 300 characters of the customer's words, cut on a whole character, with an ellipsis only when something was cut. */
export function clampChangesText(text: string): string {
  const characters = Array.from(text.trim());
  if (characters.length <= CHANGES_QUOTE_LIMIT) return characters.join("");
  return `${characters.slice(0, CHANGES_QUOTE_LIMIT).join("").trimEnd()}…`;
}

/** Sent once when a customer sends changes on their preview, so they know the team has them and when to expect the new one. */
export function previewChangesReceivedEmail(input: PreviewChangesReceivedInput): EmailMessage {
  for (const [name, value] of [["round", input.round], ["rounds", input.rounds]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a whole number of at least 1, received ${value}`);
  }
  const subject = "We got your changes";
  const greeting = emailGreeting(input.name);
  const intro = `We have your changes for round ${input.round} of ${input.rounds}:`;
  const quoted = clampChangesText(input.text);
  const next = input.readyBy === null ? null : `We will email you when the new preview is ready, by ${input.readyBy}.`;
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "preview-changes-received",
    bodyText: [
      greeting,
      intro,
      quoted
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n"),
      ...(next === null ? [] : [next]),
      signOff,
    ].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Changes received",
      heading: subject,
      body: [receiptParagraph(greeting), receiptParagraph(intro), receiptQuote(quoted), ...(next === null ? [] : [receiptParagraph(next)]), receiptParagraph(signOff)],
    }),
  };
}
