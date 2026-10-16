import { BodyTooLargeError, readLimitedBody } from "@/lib/server/read-limited-body";
import { handleOyeChatsWebhook } from "@/lib/server/oyechats-webhook";
import { noteSecurityEvent } from "@/lib/server/security-events";

/** A lead is a few short fields; this leaves room for OyeChats to add more without letting a stranger send megabytes. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * OyeChats' server-to-server delivery of a visitor's details (and, later, how warm the lead is). Staff register this
 * address as the bot's webhook in OyeChats and keep the secret OyeChats made for it on the bot's page in the console.
 * Answers 200 once the signature is valid, even for an event Fynix does not use, so OyeChats does not retry it for hours;
 * anything unsigned, or signed for a bot we do not know, gets one 401.
 */
export async function POST(request: Request): Promise<Response> {
  let body: string;
  try {
    body = new TextDecoder().decode(await readLimitedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "body too large" }, 413);
    throw error;
  }

  const result = await handleOyeChatsWebhook(body, request.headers.get("x-oyechats-signature"));
  if (result.kind === "refused") {
    // Counted across servers; a few in an hour may be someone faking leads, and the team is emailed.
    void noteSecurityEvent("webhook_signature_invalid");
    return json({ error: "invalid signature" }, 401);
  }
  return json({ received: true }, 200);
}
