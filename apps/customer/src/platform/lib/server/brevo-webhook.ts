import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { hasTakenWebhookEvent, markEmailBounced, recordWebhookEvent, suppressEmailAddress, type EmailSuppressionReason, type WebhookResult } from "@brandbasket/db";
import { z } from "zod";
import { bodyFingerprint } from "@/platform/lib/webhook-event";
import { getStaffDb } from "./db";

/** The shared secret Brevo sends back on every delivery. Shorter than this counts as unset, and the route then refuses everything. */
export const BREVO_WEBHOOK_SECRET_MIN_LENGTH = 32;

export function brevoWebhookSecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const secret = env.BREVO_WEBHOOK_SECRET?.trim() ?? "";
  return secret.length >= BREVO_WEBHOOK_SECRET_MIN_LENGTH ? secret : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Brevo does not sign webhook bodies. It supports custom headers (and a bearer token) on a webhook, so the secret travels in
 * `Authorization: Bearer <secret>`; a `?secret=` on the webhook URL is accepted for the dashboard form that only takes a URL.
 * Compared by digest so timing leaks nothing.
 */
export function isBrevoRequestAuthorised(request: Request, secret: string): boolean {
  const header = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const given = header ?? new URL(request.url).searchParams.get("secret") ?? "";
  return given !== "" && timingSafeEqual(digest(given), digest(secret));
}

const eventSchema = z.object({
  event: z.string().min(1).max(64),
  email: z.string().min(3).max(320),
  "message-id": z.string().max(512).optional(),
  id: z.union([z.string().max(128), z.number()]).optional(),
  reason: z.string().max(500).optional(),
});

/** Brevo's event names that stop optional mail to the address: a bounce Brevo will not retry, a complaint, an unsubscribe. */
const SUPPRESSING: Readonly<Record<string, EmailSuppressionReason>> = {
  hard_bounce: "bounce",
  invalid_email: "bounce",
  blocked: "bounce",
  spam: "complaint",
  complaint: "complaint",
  unsubscribed: "unsubscribe",
};
const BOUNCING: ReadonlySet<string> = new Set(["hard_bounce", "invalid_email", "blocked"]);

export type BrevoWebhookResult = "handled" | "ignored" | "malformed";

/**
 * Handles one Brevo event. Bounces, complaints and unsubscribes write `email_suppressions` (optional mail skips the address
 * from then on; mandatory mail still goes), and a bounce also marks the message Brevo took as `bounced`. Other events (delivered,
 * opened, soft bounces Brevo retries itself) are noted and ignored. A repeated event id is answered and not handled twice.
 * The delivery is noted in `webhook_events` (never the body). Throws on a database error so Brevo retries.
 */
export async function handleBrevoEvent(rawBody: string): Promise<BrevoWebhookResult> {
  const db = getStaffDb();
  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(JSON.parse(rawBody));
  } catch {
    await note(rawBody, "unknown", "failed", null, "Body was not a Brevo event");
    return "malformed";
  }
  const eventId = parsed.id !== undefined ? String(parsed.id) : parsed["message-id"] !== undefined ? `${parsed.event}:${parsed["message-id"]}` : null;
  if (eventId !== null && (await hasTakenWebhookEvent(db, "brevo", eventId))) return "handled";

  const reason = SUPPRESSING[parsed.event];
  if (reason === undefined) {
    await note(rawBody, parsed.event, "ignored", eventId, null);
    return "ignored";
  }
  try {
    await suppressEmailAddress(db, parsed.email, reason);
    const messageId = parsed["message-id"];
    if (BOUNCING.has(parsed.event) && messageId !== undefined) await markEmailBounced(db, messageId, `Brevo reported ${parsed.event.replace("_", " ")}`);
  } catch (error) {
    await note(rawBody, parsed.event, "failed", eventId, `Handler threw ${error instanceof Error ? error.name : "an error"}`);
    throw error;
  }
  await note(rawBody, parsed.event, "handled", eventId, null);
  return "handled";
}

/** Notes a delivery that failed its secret check, as the other receivers do. */
export async function noteBadBrevoRequest(rawBody: string): Promise<void> {
  await note(rawBody, "unknown", "bad_signature", null, null);
}

async function note(body: string, eventType: string, result: WebhookResult, eventId: string | null, error: string | null): Promise<void> {
  try {
    await recordWebhookEvent(getStaffDb(), { source: "brevo", eventType, result, error, businessId: null, eventId, ...bodyFingerprint(body) });
  } catch (cause) {
    console.error("[brevo-webhook] A delivery could not be noted.", cause instanceof Error ? cause.name : "unknown");
  }
}
