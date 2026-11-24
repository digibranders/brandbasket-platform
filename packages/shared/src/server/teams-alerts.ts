import "server-only";
import {
  clearSiteSetting,
  consumeRateLimit,
  findAlertDelivery,
  findSiteSetting,
  findSiteSettingWithEditor,
  recordAlertDelivery,
  saveSiteSetting,
  updateAlertDelivery,
  type AlertResult,
  type Database,
} from "@brandbasket/db";
import { formatIstTime, teamsCard, teamsCardTitle, teamsSettingKey, TEAMS_DESTINATION_INFO, type TeamsDestination, type TeamsMessage } from "../lib/teams-webhook";
import { openSecret, sealSecret } from "./secret-seal";

const POST_TIMEOUT_MS = 8_000;


/** What a Teams address is, as the console shows it. The address itself is never returned for display. */
export type TeamsHookState =
  | { readonly state: "unset" }
  | { readonly state: "set"; readonly changedAt: Date; readonly changedBy: string | null }
  /** Saved, but sealed with another auth secret: it has to be pasted again. */
  | { readonly state: "unreadable"; readonly changedAt: Date; readonly changedBy: string | null };

export async function loadTeamsHookState(db: Database, secret: string, destination: TeamsDestination): Promise<TeamsHookState> {
  const setting = await findSiteSettingWithEditor(db, teamsSettingKey(destination));
  if (setting === null) return { state: "unset" };
  const state = openSecret(secret, setting.value) === null ? "unreadable" : "set";
  return { state, changedAt: setting.updatedAt, changedBy: setting.updatedByEmail };
}

export async function saveTeamsHook(
  db: Database,
  secret: string,
  input: { readonly destination: TeamsDestination; readonly url: string; readonly staffUserId: string; readonly now: Date },
): Promise<void> {
  await saveSiteSetting(db, { key: teamsSettingKey(input.destination), value: sealSecret(secret, input.url), staffUserId: input.staffUserId, now: input.now });
}

export async function clearTeamsHook(db: Database, destination: TeamsDestination): Promise<void> {
  await clearSiteSetting(db, teamsSettingKey(destination));
}

export type TeamsPostResult = "sent" | "rejected" | "unreachable";

/**
 * Posts one message. The address is a secret, so nothing here logs it or an error that could carry it. Workflows answers
 * 202 once it has taken the message; any other answer means Teams did not accept it.
 */
export async function postToTeams(url: string, message: TeamsMessage, post: typeof fetch = fetch): Promise<TeamsPostResult> {
  try {
    const response = await post(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      redirect: "error",
    });
    return response.ok ? "sent" : "rejected";
  } catch {
    return "unreachable";
  }
}

/** One retry, after a short wait, only when Teams could not be reached (a network blip). An answer from Teams is final. */
const RETRY_DELAY_MS = 2_000;

async function postWithOneRetry(url: string, message: TeamsMessage, post: typeof fetch, retryDelayMs: number): Promise<TeamsPostResult> {
  const first = await postToTeams(url, message, post);
  if (first !== "unreachable") return first;
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  return postToTeams(url, message, post);
}

/** Dedupe keys are kept for a day: the same event never posts twice in that time (fixed window, so a repeat across midnight UTC may post again). */
const DEDUPE_WINDOW_SECONDS = 86_400;

/** True when this key already posted in the window. Fails open: a card twice is better than a card never. */
async function alreadyPosted(db: Database, destination: TeamsDestination, dedupeKey: string): Promise<boolean> {
  try {
    const { allowed } = await consumeRateLimit(db, `teams-alert:${destination}:${dedupeKey}`, { limit: 1, windowSeconds: DEDUPE_WINDOW_SECONDS });
    return !allowed;
  } catch {
    return false;
  }
}

export interface SendTeamsAlertOptions {
  /** What makes this the same alert as an earlier one (a delivery id, a booking id). Omit for alerts that may repeat. */
  readonly dedupeKey?: string;
  readonly retryDelayMs?: number;
}

/** Notes one alert for the console's Deliveries page. Never throws: a note that cannot be written is logged, without the address. */
async function noteAlert(db: Database, destination: TeamsDestination, message: TeamsMessage, result: AlertResult): Promise<void> {
  try {
    await recordAlertDelivery(db, { destination, title: teamsCardTitle(message), result, card: result === "sent" ? null : { ...message } });
  } catch (error) {
    console.error("[teams-alert] The alert could not be noted.", error instanceof Error ? error.name : "error");
  }
}

/**
 * Tells a Teams channel about something, if staff have set an address for that kind of alert. Best-effort like every alert:
 * the customer's own action is already done, so an unreadable address or a failed post is logged (without the address)
 * and noted for the console, and never thrown. With no address saved nothing is attempted and nothing is noted here; Today's Systems block warns about it. An unreachable Teams is tried once more.
 */
export async function sendTeamsAlert(
  db: Database,
  secret: string,
  destination: TeamsDestination,
  message: TeamsMessage,
  post: typeof fetch = fetch,
  options: SendTeamsAlertOptions = {},
): Promise<void> {
  try {
    const setting = await findSiteSetting(db, teamsSettingKey(destination));
    if (setting === null) return;
    if (options.dedupeKey !== undefined && (await alreadyPosted(db, destination, options.dedupeKey))) return;
    const url = openSecret(secret, setting.value);
    const result: AlertResult = url === null ? "unreadable" : await postWithOneRetry(url, message, post, options.retryDelayMs ?? RETRY_DELAY_MS);
    if (result !== "sent") console.error(`[teams-alert] The ${destination} alert was not delivered (${result}).`);
    await noteAlert(db, destination, message, result);
  } catch (error) {
    console.error(`[teams-alert] The ${destination} alert could not be sent.`, error instanceof Error ? error.name : "error");
  }
}

export type TeamsResendResult = "sent" | "failed" | "refused";

/**
 * Sends a noted alert again to its channel's current address, for staff on the Deliveries page. Refuses one that went
 * through or has no card kept. Records the try either way.
 */
export async function resendTeamsAlert(db: Database, secret: string, deliveryId: string, now: Date, post: typeof fetch = fetch): Promise<TeamsResendResult> {
  const delivery = await findAlertDelivery(db, deliveryId);
  if (delivery === null || delivery.result === "sent" || delivery.card === null) return "refused";
  const setting = await findSiteSetting(db, teamsSettingKey(delivery.destination));
  const url = setting === null ? null : openSecret(secret, setting.value);
  // The card was written by noteAlert from a TeamsMessage, so it has that shape.
  const result: AlertResult = url === null ? "unreadable" : await postToTeams(url, delivery.card as unknown as TeamsMessage, post);
  await updateAlertDelivery(db, deliveryId, { result, now });
  return result === "sent" ? "sent" : "failed";
}

export type TeamsTestResult = "sent" | "unset" | "unreadable" | "failed";

/** Posts a test card to a destination so staff can see it arrive. Reports what happened instead of swallowing it. */
export async function sendTeamsTest(
  db: Database,
  secret: string,
  destination: TeamsDestination,
  by: { readonly email: string; readonly now: Date },
  post: typeof fetch = fetch,
): Promise<TeamsTestResult> {
  const setting = await findSiteSetting(db, teamsSettingKey(destination));
  if (setting === null) return "unset";
  const url = openSecret(secret, setting.value);
  if (url === null) return "unreadable";
  const message = teamsCard({
    title: "Test from the Brandbasket console",
    subtitle: TEAMS_DESTINATION_INFO[destination].label,
    facts: [
      { name: "Sent by", value: by.email },
      { name: "Time", value: formatIstTime(by.now) },
    ],
    text: "If you can read this, alerts of this kind will arrive in this channel.",
  });
  return (await postToTeams(url, message, post)) === "sent" ? "sent" : "failed";
}
