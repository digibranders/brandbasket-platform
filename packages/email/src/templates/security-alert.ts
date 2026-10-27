import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptRows } from "../receipt";

/*
 * Security alerts to the Brandbasket team (CERT-In Directions 2022 and the breach runbook, vps-setup/BREACH-RESPONSE.md: watch
 * for signs of an attack, and act within six hours of noticing one). They go to the team's alert mailbox only, and carry
 * no customer data: what kind of event, how many, over what time, and where to look.
 */

export interface SecurityEventAlertInput {
  readonly to: string;
  /** What happened, in a few words: "Sign-ins blocked for too many tries". */
  readonly eventLabel: string;
  /** What it may mean and what to check first. */
  readonly advice: string;
  readonly count: number;
  readonly windowMinutes: number;
  readonly app: string;
  readonly consoleUrl?: string | null;
}

/** Sent once an hour at most per kind of event, when that event passes its limit. */
export function securityEventAlertEmail(input: SecurityEventAlertInput): EmailMessage {
  const consoleUrl = input.consoleUrl ? assertWebUrl(input.consoleUrl, "consoleUrl") : null;
  const summary = `${input.count} or more in ${input.windowMinutes} minutes`;
  const breach = "If this looks like an attack, follow vps-setup/BREACH-RESPONSE.md. CERT-In must be told within 6 hours of noticing an incident.";
  const text = [
    `Security alert: ${input.eventLabel}`,
    `How many: ${summary}`,
    `Where: ${input.app}`,
    "",
    input.advice,
    "",
    breach,
    ...(consoleUrl ? ["", `Open the console: ${consoleUrl}`] : []),
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[Security] ${input.eventLabel} (${summary})`),
    template: "security-event-alert",
    bodyText: text.join("\n"),
    bodyHtml: receiptDocument({
      title: `Security alert: ${input.eventLabel}`,
      kicker: "Security alert",
      heading: `Security alert: ${input.eventLabel}`,
      body: [
        receiptRows([
          { label: "What", value: input.eventLabel },
          { label: "How many", value: summary },
          { label: "Where", value: input.app },
        ]),
        receiptParagraph(input.advice),
        receiptParagraph(breach),
        ...(consoleUrl ? [receiptButton(consoleUrl, "Open the console")] : []),
      ],
    }),
  };
}

export interface StaffAccessFinding {
  /** The staff member's sign-in address: staff data, not a customer's. */
  readonly staff: string;
  readonly what: string;
  readonly count: number;
}

export interface StaffAccessReviewInput {
  readonly to: string;
  readonly findings: readonly StaffAccessFinding[];
  readonly hours: number;
  readonly consoleUrl: string;
}

/** The nightly look at the staff access log: who did something unusual, and how often, in the last day. */
export function staffAccessReviewEmail(input: StaffAccessReviewInput): EmailMessage {
  if (input.findings.length === 0) throw new Error("A staff access review email needs at least one finding");
  const consoleUrl = assertWebUrl(input.consoleUrl, "consoleUrl");
  const lines = input.findings.map((finding) => `${finding.staff}: ${finding.what}, ${finding.count} times`);
  const text = [
    `In the last ${input.hours} hours the staff console's access log shows activity worth a look:`,
    "",
    ...lines,
    "",
    "Check that each was expected. If not, follow vps-setup/BREACH-RESPONSE.md.",
    "",
    `Open the access log: ${consoleUrl}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[Security] Staff access review: ${input.findings.length} ${input.findings.length === 1 ? "item" : "items"} to check`),
    template: "staff-access-review",
    bodyText: text.join("\n"),
    bodyHtml: receiptDocument({
      title: "Staff access review",
      kicker: "Staff access review",
      heading: "Staff access review",
      body: [
        receiptParagraph(`In the last ${input.hours} hours the staff console's access log shows activity worth a look:`),
        receiptRows(input.findings.map((finding) => ({ label: finding.staff, value: `${finding.what}, ${finding.count} times` })), { labelWidth: 140 }),
        receiptParagraph("Check that each was expected. If not, follow vps-setup/BREACH-RESPONSE.md."),
        receiptButton(consoleUrl, "Open the access log"),
      ],
    }),
  };
}
