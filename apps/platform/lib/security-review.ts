import { tallyStaffAccessSince, type Database, type StaffAccessTally } from "@brandbasket/db";
import { emailTeamInboxDefault, staffAccessReviewEmail, type EmailTransport, type StaffAccessFinding } from "@brandbasket/email";

/*
 * The nightly look at the staff access log (CERT-In Directions 2022, and the breach runbook's "watch for signs"): a staff
 * member doing something far more often than the work needs, or being refused or failing to sign in again and again, is
 * emailed to the team's alert mailbox so a person checks it. Imports nothing server-only, so the nightly maintenance script
 * runs it. The limits are per staff member per day, set well above a normal day's work.
 */

const REVIEW_HOURS = 24;

interface Limit {
  readonly action: string;
  readonly result: "ok" | "failed" | "denied";
  /** Listed once a staff member reaches this many in the day. */
  readonly atLeast: number;
  readonly what: string;
}

const STAFF_ACCESS_LIMITS: readonly Limit[] = [
  { action: "invoice.export", result: "ok", atLeast: 4, what: "Exported the invoice register" },
  { action: "staff.sign_in", result: "failed", atLeast: 5, what: "Failed to sign in" },
  { action: "access.denied", result: "denied", atLeast: 5, what: "Was refused a page that needs a higher role" },
  { action: "client.view", result: "ok", atLeast: 150, what: "Opened a client" },
  { action: "lead.view", result: "ok", atLeast: 150, what: "Opened a lead" },
  { action: "support_attachment.view", result: "ok", atLeast: 60, what: "Opened a support screenshot" },
  { action: "outbox.view", result: "ok", atLeast: 60, what: "Opened an outbox message" },
];

/** The tallies that reached a limit, the largest first. */
export function staffAccessFindings(tally: readonly StaffAccessTally[]): readonly StaffAccessFinding[] {
  const findings: StaffAccessFinding[] = [];
  for (const row of tally) {
    const limit = STAFF_ACCESS_LIMITS.find((candidate) => candidate.action === row.action && candidate.result === row.result);
    if (limit !== undefined && row.count >= limit.atLeast) findings.push({ staff: row.staffEmail, what: limit.what, count: row.count });
  }
  return findings.sort((a, b) => b.count - a.count);
}

/** Emails the team when the last day's staff access has anything worth checking. Returns how many items were listed. */
export async function sendStaffAccessReview(
  db: Database,
  transport: EmailTransport,
  config: { readonly to: string; readonly adminOrigin: string; readonly now: Date },
): Promise<number> {
  const since = new Date(config.now.getTime() - REVIEW_HOURS * 60 * 60 * 1000);
  const findings = staffAccessFindings(await tallyStaffAccessSince(db, since));
  if (findings.length === 0) return 0;
  await transport.send(
    staffAccessReviewEmail({ to: config.to, findings, hours: REVIEW_HOURS, consoleUrl: new URL("/access-log", config.adminOrigin).toString() }),
  );
  return findings.length;
}

/** Where security alerts go: SECURITY_ALERT_EMAIL if set, else the support alert mailbox, else the team address. */
export function securityAlertRecipient(env: Readonly<Record<string, string | undefined>>): string {
  return env.SECURITY_ALERT_EMAIL?.trim() || env.SUPPORT_ALERT_EMAIL?.trim() || env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}
