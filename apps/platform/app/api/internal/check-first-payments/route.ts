import { NextResponse } from "next/server";
import { checkFirstPayments, firstPaymentCheckToken } from "@/lib/server/first-payment-check";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it records payments.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/check-first-payments`: asks Razorpay about every first-month offer checkout still waiting for its first payment
 * and records any it holds (plan 63), for a payment whose webhook never arrived. Called every 10 minutes by a scheduled job with
 * `Authorization: Bearer <PAYMENT_RECONCILE_TOKEN>`. It answers 503 when that secret is not configured and 401 for a missing or wrong
 * one. The report is the body; the status is 502 when Razorpay could not be asked about a checkout, so a person looks, and 200
 * otherwise. Lives under /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  const token = firstPaymentCheckToken();
  if (token === null) return NextResponse.json({ error: "The first payment check is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const report = await checkFirstPayments(new Date());
  return NextResponse.json(report, { status: report.failed > 0 ? 502 : 200 });
}
