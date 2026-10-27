import "server-only";
import { TEAMS_DESTINATIONS, type TeamsDestination } from "@brandbasket/shared/lib/teams-webhook";
import { announcePayment } from "@brandbasket/shared/server/payment-alerts";
import { clearTeamsHook, loadTeamsHookState, saveTeamsHook, sendTeamsTest, type TeamsHookState, type TeamsTestResult } from "@brandbasket/shared/server/teams-alerts";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

/** Each destination's address as the Settings page shows it: set, not set, or saved but unreadable. Never the address. */
export async function loadTeamsStates(): Promise<Readonly<Record<TeamsDestination, TeamsHookState>>> {
  const secret = serverEnv().BETTER_AUTH_SECRET;
  const states = await Promise.all(TEAMS_DESTINATIONS.map((destination) => loadTeamsHookState(getStaffDb(), secret, destination)));
  return Object.fromEntries(TEAMS_DESTINATIONS.map((destination, index) => [destination, states[index]])) as Record<TeamsDestination, TeamsHookState>;
}

/** The caller has already read and checked the address (readTeamsWebhookUrl) and that the staff member may do this. */
export async function saveTeamsUrl(input: { readonly destination: TeamsDestination; readonly url: string; readonly staffUserId: string }, now: Date): Promise<void> {
  await saveTeamsHook(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, { ...input, now });
}

export async function removeTeamsUrl(destination: TeamsDestination): Promise<void> {
  await clearTeamsHook(getStaffDb(), destination);
}

export function testTeamsUrl(destination: TeamsDestination, by: { readonly email: string }, now: Date): Promise<TeamsTestResult> {
  return sendTeamsTest(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, destination, { email: by.email, now });
}

/**
 * Tells the Payments channel about a payment staff recorded by hand (a bank transfer). Call it after the payment's transaction
 * has committed, for a payment recorded for the first time. Best-effort: it never throws.
 */
export async function announcePaymentToTeams(paymentId: string): Promise<void> {
  try {
    await announcePayment(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, paymentId, serverEnv().ADMIN_ORIGIN);
  } catch (error) {
    console.error("[teams-alert] A payment could not be announced.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}
