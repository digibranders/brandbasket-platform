import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "@fynix/billing";
import { noteSecurityEvent } from "@/lib/server/security-events";
import { razorpayWebhookSecret } from "@/lib/server/billing";
import { logBillingEvent } from "@fynix/shared/server/billing-log";
import { handleRazorpayWebhookEvent } from "@/lib/server/razorpay-webhook-handler";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Razorpay's server-to-server notification of every subscription event. Reads the body as raw text (never
 * `request.json()` first) because the signature is computed over the exact bytes Razorpay sent — re-serialising
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
    return json({ error: "invalid signature" }, 400);
  }

  await handleRazorpayWebhookEvent(parseRazorpayWebhookEvent(body));
  return json({ received: true }, 200);
}
