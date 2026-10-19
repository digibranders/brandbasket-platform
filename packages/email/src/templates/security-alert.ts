import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

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
  const text = [
    `Security alert: ${input.eventLabel}`,
    `How many: ${summary}`,
    `Where: ${input.app}`,
    "",
    input.advice,
    "",
    "If this looks like an attack, follow vps-setup/BREACH-RESPONSE.md. CERT-In must be told within 6 hours of noticing an incident.",
    ...(consoleUrl ? ["", `Open the console: ${consoleUrl}`] : []),
  ];
  const html = [
    `<strong>What:</strong> ${escapeHtml(input.eventLabel)}`,
    `<strong>How many:</strong> ${escapeHtml(summary)}`,
    `<strong>Where:</strong> ${escapeHtml(input.app)}`,
    escapeHtml(input.advice),
    "If this looks like an attack, follow vps-setup/BREACH-RESPONSE.md. CERT-In must be told within 6 hours of noticing an incident.",
    ...(consoleUrl
      ? [
          `<a href="${escapeHtml(consoleUrl)}" style="display:inline-block;padding:10px 20px;background:#2a0d10;color:#f6efe6;text-decoration:none;border-radius:20px;font-weight:600">Open the console</a>`,
        ]
      : []),
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[Security] ${input.eventLabel} (${summary})`),
    template: "security-event-alert",
    bodyText: text.join("\n"),
    bodyHtml: htmlDocument(`Security alert: ${input.eventLabel}`, html),
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
  const html = [
    `In the last ${input.hours} hours the staff console&rsquo;s access log shows activity worth a look:`,
    `<ul style="margin:0;padding-left:20px">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    "Check that each was expected. If not, follow vps-setup/BREACH-RESPONSE.md.",
    `<a href="${escapeHtml(consoleUrl)}" style="display:inline-block;padding:10px 20px;background:#2a0d10;color:#f6efe6;text-decoration:none;border-radius:20px;font-weight:600">Open the access log</a>`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[Security] Staff access review: ${input.findings.length} ${input.findings.length === 1 ? "item" : "items"} to check`),
    template: "staff-access-review",
    bodyText: text.join("\n"),
    bodyHtml: htmlDocument("Staff access review", html),
  };
}
