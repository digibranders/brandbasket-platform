import { handleCalcomWebhook, type CalcomWebhookResult } from "@/lib/server/calcom-webhook";
import { noteWebhook, type WebhookOutcome } from "@/lib/server/webhook-log";
import { failureReason } from "@/lib/webhook-event";
import { BodyTooLargeError, readLimitedBody } from "@/lib/server/read-limited-body";
import { noteSecurityEvent } from "@/lib/server/security-events";

/** A booking notice is a few kilobytes; this leaves room for Cal.com's extra fields without letting a stranger send megabytes. */
const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** What the console says about each answer the handler gives. */
function outcomeOf(result: CalcomWebhookResult): WebhookOutcome {
  switch (result.kind) {
    case "moved":
    case "recorded":
    case "removed":
      return { result: "handled" };
    case "ignored":
      return { result: "ignored" };
    case "refused":
      return { result: "bad_signature" };
    case "unconfigured":
      return { result: "failed", error: "CALCOM_WEBHOOK_SECRET is not set" };
    default: {
      const unhandled: never = result;
      throw new Error(`Unhandled Cal.com result ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Cal.com's server-to-server notice that a booking was created, cancelled or rescheduled (staff add this address as a webhook
 * in Cal.com with those three events ticked, and the secret that is CALCOM_WEBHOOK_SECRET here). Answers 200 once the signature is valid, even for an event
 * or a booking this app does not act on, so Cal.com does not retry it; an unsigned or wrongly signed delivery gets 401, and
 * a server with no secret set answers 503 rather than act on something it cannot check.
 */
export async function POST(request: Request): Promise<Response> {
  let body: string;
  try {
    body = new TextDecoder().decode(await readLimitedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "body too large" }, 413);
    throw error;
  }

  let result: CalcomWebhookResult;
  try {
    result = await handleCalcomWebhook(body, request.headers.get("x-cal-signature-256"), new Date());
  } catch (error) {
    await noteWebhook("calcom", body, { result: "failed", error: failureReason(error) });
    throw error;
  }
  // shortcut: Cal.com rows carry no business id; return it from handleCalcomWebhook when staff need the link.
  await noteWebhook("calcom", body, outcomeOf(result));
  if (result.kind === "unconfigured") {
    console.error("[calcom-webhook] a delivery arrived but CALCOM_WEBHOOK_SECRET is not set");
    return json({ error: "not configured" }, 503);
  }
  if (result.kind === "refused") {
    // Counted across servers; a few in an hour may be someone faking calendar changes, and the team is emailed.
    void noteSecurityEvent("webhook_signature_invalid");
    return json({ error: "invalid signature" }, 401);
  }
  return json({ received: true }, 200);
}
