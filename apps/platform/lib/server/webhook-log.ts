import "server-only";
import { recordWebhookEvent, type WebhookResult, type WebhookSource } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { bodyFingerprint, webhookEventName } from "@/lib/webhook-event";
import { getStaffDb } from "./db";

/** Where each provider writes the event's name in its body. */
const EVENT_FIELD: Readonly<Record<WebhookSource, string>> = { razorpay: "event", calcom: "triggerEvent", oyechats: "event" };

export interface WebhookOutcome {
  readonly result: WebhookResult;
  readonly error?: string | null;
  readonly businessId?: string | null;
}

/**
 * Notes one received webhook for the console's Deliveries page: its event, result and fingerprint, never its body.
 * Runs on the staff connection like the handlers themselves. Never throws: the provider must get its answer even when
 * the note cannot be written.
 */
export async function noteWebhook(source: WebhookSource, body: string, outcome: WebhookOutcome): Promise<void> {
  try {
    await recordWebhookEvent(getStaffDb(), {
      source,
      eventType: webhookEventName(body, EVENT_FIELD[source]),
      result: outcome.result,
      error: outcome.error ?? null,
      businessId: outcome.businessId ?? null,
      ...bodyFingerprint(body),
    });
  } catch (error) {
    console.error("[webhook-log] A webhook could not be noted.", { source, ...errorLogInfo(error) });
  }
}
