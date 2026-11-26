import { assertWebUrl, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface SignupReminderInput {
  readonly to: string;
  readonly continueUrl: string;
  /**
   * True when `continueUrl` signs the person in or sets their password (a customer who paid first has no password, plan 64): the
   * outbox then keeps the wording without the link.
   */
  readonly linkWithheld?: boolean;
}

/**
 * Sent to an abandoned sign-up 1 day after account creation (D21): reminds the customer
 * to complete their setup and pick their plan. It names no text the sign-up form supplied (a business name is typed by whoever
 * used the address, before the address was proven), so it cannot be used to put words in Brandbasket's mouth.
 */
export function signupReminderEmail(input: SignupReminderInput): EmailMessage {
  const brand = emailBrandName();
  const continueUrl = assertWebUrl(input.continueUrl, "continueUrl");
  const subject = `Finish setting up your ${brand} account`;
  const intro = `Your ${brand} account is ready, but your setup is not complete yet.`;
  const instruction = "Pick your plan and complete your setup to get started with your new website and services:";
  const help = "If you have any questions or need a hand, simply reply to this email and our team will help you.";
  const ignore = `If you did not sign up for ${brand}, you can safely ignore this email.`;

  const lines = [intro, instruction, continueUrl, help, ignore];

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "signup-reminder",
    bodyText: lines.join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Complete your setup",
      heading: subject,
      body: [
        receiptParagraph(intro),
        receiptParagraph(instruction),
        receiptButton(continueUrl, "Complete your setup"),
        receiptParagraph(help),
      ],
      footer: [ignore],
    }),
    ...(input.linkWithheld === true ? { outboxCopy: withheldLinkCopy(subject, [intro, instruction, help, ignore]) } : {}),
  };
}
