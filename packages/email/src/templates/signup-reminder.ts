import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface SignupReminderInput {
  readonly to: string;
  readonly businessName: string;
  readonly continueUrl: string;
}

/**
 * Sent to an abandoned sign-up 1 day after account creation (D21): reminds the customer
 * to complete their setup and pick their plan.
 */
export function signupReminderEmail(input: SignupReminderInput): EmailMessage {
  const brand = emailBrandName();
  const continueUrl = assertWebUrl(input.continueUrl, "continueUrl");
  const subject = `Finish setting up ${input.businessName} on ${brand}`;
  const intro = `Your account for ${input.businessName} is ready, but your setup is not complete yet.`;
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
  };
}
