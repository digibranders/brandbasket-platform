import "server-only";
import type { TeamsDestination, TeamsMessage } from "@brandbasket/shared/lib/teams-webhook";
import { announcePayment } from "@brandbasket/shared/server/payment-alerts";
import { sendTeamsAlert } from "@brandbasket/shared/server/teams-alerts";
import { serverEnv } from "./env";
import { getStaffDb } from "./db";

/**
 * Posts an alert to the Teams channel staff set up for that kind of alert (console Settings). Best-effort: it never throws.
 * Reads the channel's address on the staff connection, because the sealed address sits in staff-only site_settings; the
 * public and customer roles cannot read it.
 */
export async function alertTeams(destination: TeamsDestination, message: TeamsMessage): Promise<void> {
  try {
    await sendTeamsAlert(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, destination, message);
  } catch (error) {
    console.error(`[teams-alert] The ${destination} alert could not be sent.`, error instanceof Error ? error.name : "error");
  }
}

/**
 * Tells the Payments channel about a payment that has just been recorded, with the customer's details. Call it after the
 * payment's transaction has committed, for a payment recorded for the first time. Best-effort: it never throws.
 */
export async function announcePaymentToTeams(paymentId: string): Promise<void> {
  try {
    await announcePayment(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, paymentId, serverEnv().ADMIN_ORIGIN);
  } catch (error) {
    console.error("[teams-alert] A payment could not be announced.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}
