import "server-only";
import type { TeamsDestination, TeamsMessage } from "@brandbasket/shared/lib/teams-webhook";
import type { PlanStatusAlert } from "@brandbasket/shared/lib/payment-alert-card";
import { registerBillingErrorAlerts } from "@brandbasket/shared/server/billing-error-alerts";
import { announcePayment, announcePlanStatus } from "@brandbasket/shared/server/payment-alerts";
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

/**
 * Tells the Payments channel that a plan went into payment retry, stopped billing or ended. Call it only when the status changed.
 * Best-effort: it never throws.
 */
export async function announcePlanStatusToTeams(change: {
  readonly businessId: string;
  readonly subscriptionId: string;
  readonly status: PlanStatusAlert;
  readonly providerStatus: string;
}): Promise<void> {
  try {
    await announcePlanStatus(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, change, serverEnv().ADMIN_ORIGIN);
  } catch (error) {
    console.error("[teams-alert] A plan change could not be announced.", { error: error instanceof Error ? error.name : "error" });
  }
}

/** Starts telling the System channel about billing errors (the billing log's error lines). Called once at startup. */
export function startBillingErrorAlerts(): void {
  try {
    registerBillingErrorAlerts((message) => alertTeams("system", message), serverEnv().ADMIN_ORIGIN);
  } catch (error) {
    console.error("[teams-alert] Billing error alerts could not start.", error instanceof Error ? error.name : "error");
  }
}
