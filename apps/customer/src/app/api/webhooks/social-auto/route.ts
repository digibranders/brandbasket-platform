import { BodyTooLargeError, readLimitedBody } from "@brandbasket/shared/server/read-limited-body";
import { noteSecurityEvent } from "@/platform/lib/server/security-events";
import { noteSocialAutoFailure, socialAutoDeps } from "@/platform/lib/server/social-auto-deps";
import { handleSocialAutoWebhook, type SocialAutoResult } from "@/platform/lib/server/social-auto-webhook";
import { failureReason } from "@/platform/lib/webhook-event";

/** An event is a few hundred bytes; this leaves room for growth without letting a stranger send megabytes. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * social-auto's server-to-server events (a post failed, a connection is about to expire, pictures are ready and so on), signed with
 * SOCIAL_AUTO_WEBHOOK_SECRET. Each event becomes a customer notice through notify(). Answers 200 once the event is stored, even for
 * one this app does not act on, so social-auto does not retry it; a bad signature gets 401 and a server with no secret 503.
 */
export async function POST(request: Request): Promise<Response> {
  let body: string;
  try {
    body = new TextDecoder().decode(await readLimitedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "body too large" }, 413);
    throw error;
  }
  let result: SocialAutoResult;
  try {
    result = await handleSocialAutoWebhook(body, request.headers.get("x-social-signature"), new Date(), socialAutoDeps());
  } catch (error) {
    await noteSocialAutoFailure(body, "failed", failureReason(error));
    throw error;
  }
  if (result.kind === "unconfigured") {
    console.error("[social-auto-webhook] a delivery arrived but SOCIAL_AUTO_WEBHOOK_SECRET is not set");
    return json({ error: "not configured" }, 503);
  }
  if (result.kind === "refused") {
    void noteSecurityEvent("webhook_signature_invalid");
    await noteSocialAutoFailure(body, "bad_signature", null);
    return json({ error: "invalid signature" }, 401);
  }
  return json({ received: true }, 200);
}
