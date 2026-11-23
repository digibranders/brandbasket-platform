import { BodyTooLargeError, readLimitedBody } from "@brandbasket/shared/server/read-limited-body";
import { brevoWebhookSecret, handleBrevoEvent, isBrevoRequestAuthorised, noteBadBrevoRequest } from "@/platform/lib/server/brevo-webhook";

const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Brevo's transactional email events (bounce, complaint, unsubscribe). Staff add this address as a webhook in Brevo with the
 * secret named BREVO_WEBHOOK_SECRET sent as `Authorization: Bearer <secret>` (or `?secret=` on the URL). 503 when no secret is
 * configured, 401 for a missing or wrong one, 200 once handled or ignored, 500 on a database error so Brevo retries.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = brevoWebhookSecret();
  if (secret === null) return json({ error: "The Brevo webhook is not configured." }, 503);
  let body: string;
  try {
    body = new TextDecoder().decode(await readLimitedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "body too large" }, 413);
    throw error;
  }
  if (!isBrevoRequestAuthorised(request, secret)) {
    await noteBadBrevoRequest(body);
    return json({ error: "Unauthorised." }, 401);
  }
  const result = await handleBrevoEvent(body);
  return json({ received: true }, result === "malformed" ? 400 : 200);
}
