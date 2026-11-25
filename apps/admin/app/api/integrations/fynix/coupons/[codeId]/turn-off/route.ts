import { NextResponse } from "next/server";
import { fynixIntegrationKey, hasValidFynixKey } from "@/lib/server/fynix-integration";
import { turnOffReferralCodeFor } from "@/lib/server/referral-admin";

// Never cached or prerendered: it writes a coupon.
export const dynamic = "force-dynamic";

/**
 * `POST /api/integrations/fynix/coupons/{id}/turn-off`: Fynix Sales turns off a coupon it created, so nobody can use it
 * any more. `{id}` is the id returned when the coupon was created. Same machine-to-machine key as creating a coupon
 * (`Authorization: Bearer <FYNIX_INTEGRATION_KEY>`; in production Cloudflare Access must let this path through too).
 * The coupon is turned off, never deleted, so the billing record of anyone already paying on it stays whole. Turning off
 * a coupon that is already off succeeds. 200 with `{ id, active: false }`; 404 when there is no such coupon; 401 and 503
 * for the usual.
 */
export async function POST(request: Request, context: { params: Promise<{ codeId: string }> }): Promise<Response> {
  const key = fynixIntegrationKey();
  if (key === null) return NextResponse.json({ error: "The Fynix integration is not configured." }, { status: 503 });
  if (!hasValidFynixKey(request, key)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const { codeId } = await context.params;
  const outcome = await turnOffReferralCodeFor(codeId);
  if (outcome.kind === "updated") return NextResponse.json({ id: outcome.code.id, active: false });
  if (outcome.kind === "refused") return NextResponse.json({ error: outcome.refusal.message }, { status: 404 });
  return NextResponse.json({ error: "Unexpected result." }, { status: 500 });
}
