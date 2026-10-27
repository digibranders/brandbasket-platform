import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "@brandbasket/billing";
import { noteSecurityEvent } from "@/lib/server/security-events";
import { razorpayWebhookSecret } from "@/lib/server/billing";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { handleRazorpayWebhookEvent } from "@/lib/server/razorpay-webhook-handler";
import { noteWebhook } from "@/lib/server/webhook-log";
import { failureReason } from "@/lib/webhook-event";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Razorpay's server-to-server notification of every subscription event. Reads the body as raw text (never
 * `request.json()` first) because the signature is computed over the exact bytes Razorpay sent; re-serialising
 * parsed JSON can reorder keys and silently break verification. Always answers 200 once the signature is valid,
 * even for an event we choose not to act on, so Razorpay does not retry it forever; a bad signature is the one
 * case that gets a non-2xx, because that request did not come from Razorpay.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (signature === null || !verifyRazorpayWebhookSignature(body, signature, razorpayWebhookSecret())) {
    logBillingEvent("warn", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      reason: "webhook-signature-invalid",
    });
    // Counted across servers; a few in an hour may be someone faking a payment, and the team is emailed.
    void noteSecurityEvent("webhook_signature_invalid");
    await noteWebhook("razorpay", body, { result: "bad_signature" });
    return json({ error: "invalid signature" }, 400);
  }

  const event = parseRazorpayWebhookEvent(body);
  try {
    await handleRazorpayWebhookEvent(event);
  } catch (error) {
    await noteWebhook("razorpay", body, { result: "failed", error: failureReason(error) });
    throw error;
  }
  // shortcut: Razorpay rows carry no business id; return it from handleRazorpayWebhookEvent when staff need the link.
  await noteWebhook(
    "razorpay",
    body,
    event.kind === "unhandled" ? { result: "ignored" } : event.kind === "invalid" ? { result: "failed", error: "Payload could not be read" } : { result: "handled" },
  );
  return json({ received: true }, 200);
}
