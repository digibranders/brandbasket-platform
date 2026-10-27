import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptRows } from "../receipt";

/*
 * Two emails to the person who answers privacy requests (the Grievance Officer's mailbox). Neither carries a name, a number,
 * an address or anything the person wrote: a reference, what kind of request it is and when it is due, with a link to the
 * console where the rest is read behind a sign-in and logged. Personal data stays out of mailboxes.
 */

export interface PrivacyRequestAlertInput {
  readonly to: string;
  readonly reference: string;
  readonly kindLabel: string;
  /** The day the reply is due, already written out ("12 November 2026"). */
  readonly dueDay: string;
  readonly consoleUrl: string;
}

/** A new request has been filed on the website. */
export function privacyRequestAlertEmail(input: PrivacyRequestAlertInput): EmailMessage {
  const consoleUrl = assertWebUrl(input.consoleUrl, "consoleUrl");
  const text = [
    `A new privacy request has arrived: ${input.reference}`,
    `Kind: ${input.kindLabel}`,
    `Reply due by: ${input.dueDay}`,
    "",
    `Open it in the console: ${consoleUrl}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`New privacy request ${input.reference} (${input.kindLabel})`),
    template: "privacy-request-alert",
    bodyText: text.join("\n"),
    bodyHtml: receiptDocument({
      title: `New privacy request ${input.reference}`,
      kicker: "Privacy request",
      heading: `New privacy request ${input.reference}`,
      body: [
        receiptRows([
          { label: "Reference", value: input.reference },
          { label: "Kind", value: input.kindLabel },
          { label: "Reply due by", value: input.dueDay },
        ]),
        receiptButton(consoleUrl, "Open privacy requests"),
      ],
    }),
  };
}

export type PrivacyRequestDueStage = "reminder" | "urgent" | "overdue";

export interface PrivacyRequestDueItem {
  readonly reference: string;
  readonly kindLabel: string;
  readonly dueDay: string;
  readonly stage: PrivacyRequestDueStage;
  /** Whole days from tonight to the due date; zero or below once it has passed. */
  readonly daysLeft: number;
}

export interface PrivacyRequestsDueInput {
  readonly to: string;
  readonly items: readonly PrivacyRequestDueItem[];
  readonly consoleUrl: string;
}

const STAGE_WORDS: Readonly<Record<PrivacyRequestDueStage, string>> = {
  reminder: "Reminder",
  urgent: "Urgent",
  overdue: "Overdue",
};

function whenWords(item: PrivacyRequestDueItem): string {
  if (item.stage === "overdue") {
    const late = Math.max(-item.daysLeft, 0);
    return late === 0 ? `was due ${item.dueDay}` : `was due ${item.dueDay}, ${late} ${late === 1 ? "day" : "days"} ago`;
  }
  return item.daysLeft <= 0 ? `due today, ${item.dueDay}` : `due ${item.dueDay}, ${item.daysLeft} ${item.daysLeft === 1 ? "day" : "days"} left`;
}

/** Open requests that have reached day 20, day 25 or their due date and are still waiting for an answer. */
export function privacyRequestsDueEmail(input: PrivacyRequestsDueInput): EmailMessage {
  if (input.items.length === 0) throw new Error("A due-requests email needs at least one request");
  const consoleUrl = assertWebUrl(input.consoleUrl, "consoleUrl");
  const overdue = input.items.filter((item) => item.stage === "overdue").length;
  const subject =
    overdue > 0
      ? `${overdue} privacy ${overdue === 1 ? "request is" : "requests are"} overdue (${input.items.length} need attention)`
      : `${input.items.length} privacy ${input.items.length === 1 ? "request needs" : "requests need"} an answer soon`;

  const text = [
    "These privacy requests are still open and close to, or past, their due date:",
    "",
    ...input.items.map((item) => `${STAGE_WORDS[item.stage]}: ${item.reference} (${item.kindLabel}), ${whenWords(item)}`),
    "",
    `Open them in the console: ${consoleUrl}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(subject),
    template: "privacy-requests-due",
    bodyText: text.join("\n"),
    bodyHtml: receiptDocument({
      title: "Privacy requests due",
      kicker: "Privacy requests due",
      heading: "Privacy requests due",
      body: [
        receiptParagraph("These privacy requests are still open and close to, or past, their due date:"),
        receiptRows(
          input.items.map((item) => ({ label: STAGE_WORDS[item.stage], value: `${item.reference} (${item.kindLabel}), ${whenWords(item)}`, strong: item.stage === "overdue" })),
          { labelWidth: 96 },
        ),
        receiptButton(consoleUrl, "Open privacy requests"),
      ],
    }),
  };
}
