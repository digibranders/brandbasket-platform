import { NextResponse } from "next/server";
import { couponFormFromJson, fynixCouponStaffUserId, fynixIntegrationKey, hasValidFynixKey } from "@/lib/server/fynix-integration";
import { createReferralCodeFor } from "@/lib/server/referral-admin";

// Never cached or prerendered: it writes a coupon.
export const dynamic = "force-dynamic";

/**
 * `POST /api/integrations/fynix/coupons`: Fynix Sales creates a coupon and assigns it to one of its salespeople. Machine-to-machine:
 * `Authorization: Bearer <FYNIX_INTEGRATION_KEY>` instead of a staff session (in production Cloudflare Access must let this
 * path through for Fynix's service token). Body: `{ code, currency, discountKind: "amount"|"percent", discountValue,
 * discountMonths?, expiresAt?, maxRedemptions? }`. The coupon is validated exactly like one made in the console.
 * 201 with `{ id, code }`; 422 with `{ error, field }` for a refusal; 401, 503 and 400 for the usual.
 */
export async function POST(request: Request): Promise<Response> {
  const key = fynixIntegrationKey();
  const staffUserId = fynixCouponStaffUserId();
  if (key === null || staffUserId === null) return NextResponse.json({ error: "The Fynix integration is not configured." }, { status: 503 });
  if (!hasValidFynixKey(request, key)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = couponFormFromJson(body);
  if (parsed === null) return NextResponse.json({ error: "Send a JSON coupon." }, { status: 400 });

  const outcome = await createReferralCodeFor({
    formData: parsed,
    staffUserId,
    affiliateId: null,
    now: new Date(),
  });
  if (outcome.kind === "created") return NextResponse.json({ id: outcome.code.id, code: outcome.code.code }, { status: 201 });
  if (outcome.kind === "refused") {
    const status = outcome.refusal.field === "code" ? 409 : 422;
    return NextResponse.json({ error: outcome.refusal.message, field: outcome.refusal.field }, { status });
  }
  return NextResponse.json({ error: "Unexpected result." }, { status: 500 });
}
