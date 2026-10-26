import "server-only";
import type { TeamsDestination, TeamsMessage } from "@brandbasket/shared/lib/teams-webhook";
import { sendTeamsAlert } from "@brandbasket/shared/server/teams-alerts";
import { serverEnv } from "./env";
import { getStaffDb } from "./db";

/**
 * Posts an alert to the Teams channel staff set up for that kind of alert (console Settings). Best-effort: it never throws.
 * Reads the channel's address on the staff connection, because the sealed address sits in staff-only site_settings; the
 * public and customer roles cannot read it.
 */
export function alertTeams(destination: TeamsDestination, message: TeamsMessage): Promise<void> {
  return sendTeamsAlert(getStaffDb(), serverEnv().BETTER_AUTH_SECRET, destination, message);
}
