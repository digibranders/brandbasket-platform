import "server-only";
import {
  findBillingState,
  listAbandonedSignupLeads,
  markLeadPaidForBusiness,
  recordSignupReminderSent,
  type Database,
} from "@brandbasket/db";
import { signupReminderEmail, type EmailTransport } from "@brandbasket/email";
import { customerEmailTransport } from "@/features/server-common/email";
import { getStaffDb } from "@/lib/db";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/platform/lib/leads-api";

/** 24 hours (1 day) per decision D21. */
const DEFAULT_CUTOFF_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

export interface SignupReminderJobReport {
  readonly checked: number;
  readonly sent: number;
  readonly skippedPaid: number;
  readonly failed: number;
}

export interface SignupReminderJobOptions {
  readonly db?: Database;
  readonly emailTransport?: EmailTransport;
  readonly cutoffMs?: number;
  readonly limit?: number;
}

/** The shared secret the scheduled reminder runner sends. Unset or too short refuses every request. */
export function signupReminderToken(): string | null {
  const token = process.env.SIGNUP_REMINDER_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

/**
 * Finds abandoned sign-ups older than 1 day that have not paid or received a reminder (D21).
 * Sends one reminder email with a link to checkout, and records the sent timestamp so it is never repeated.
 * If the customer has paid, skips the email and marks the lead paid.
 */
export async function processSignupReminders(
  now: Date = new Date(),
  options: SignupReminderJobOptions = {},
): Promise<SignupReminderJobReport> {
  const db = options.db ?? getStaffDb();
  const transport = options.emailTransport ?? customerEmailTransport(db);
  const cutoffMs = options.cutoffMs ?? DEFAULT_CUTOFF_MS;
  const limit = options.limit ?? BATCH_LIMIT;

  const cutoff = new Date(now.getTime() - cutoffMs);
  const candidates = await listAbandonedSignupLeads(db, { cutoff, limit });

  let sent = 0;
  let skippedPaid = 0;
  let failed = 0;

  const appOrigin = process.env.APP_ORIGIN?.trim() || "https://brandbasket.in";
  const continueUrl = new URL("/checkout", appOrigin).toString();

  for (const lead of candidates) {
    let isPaid = lead.status === "paid";

    if (!isPaid && lead.businessId !== null) {
      try {
        const billingState = await findBillingState(db, lead.businessId);
        if (billingState !== null && billingState.hasEverPaid) {
          isPaid = true;
          await markLeadPaidForBusiness(db, lead.businessId);
        }
      } catch (err: unknown) {
        console.error(`Failed checking billing state for lead ${lead.id}:`, err);
      }
    }

    if (isPaid) {
      await recordSignupReminderSent(db, lead.id, now);
      skippedPaid += 1;
      continue;
    }

    try {
      const email = signupReminderEmail({
        to: lead.email,
        businessName: lead.businessName,
        continueUrl,
      });
      await transport.send(email);
      await recordSignupReminderSent(db, lead.id, now);
      sent += 1;
    } catch (err: unknown) {
      failed += 1;
      console.error(`Failed sending sign-up reminder to ${lead.email} (lead ${lead.id}):`, err);
    }
  }

  return {
    checked: candidates.length,
    sent,
    skippedPaid,
    failed,
  };
}
