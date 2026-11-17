import { NextResponse } from "next/server";
import { drainQueuedEmails, emailQueueToken } from "@/platform/lib/server/email-queue";
import { hasValidWebsiteToken } from "@/platform/lib/server/website-api-auth";

// Never cached or prerendered: it sends email.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/drain-email-queue`: sends the emails Brevo did not take the first time (status `pending`, due now), with
 * backoff, three attempts in all, then `failed` (which shows on Today and Deliveries). Called every 15 minutes by a scheduled
 * job with `Authorization: Bearer <EMAIL_QUEUE_TOKEN>`. 503 when the token is not configured or Brevo is not set up here, 401 for
 * a wrong token; the report is the body. A message that ended failed is not a failed run: it shows on Today and Deliveries.
 */
export async function POST(request: Request): Promise<Response> {
  const token = emailQueueToken();
  if (token === null) return NextResponse.json({ error: "The email queue is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const report = await drainQueuedEmails();
  if (report === null) return NextResponse.json({ error: "Brevo is not configured here." }, { status: 503 });
  return NextResponse.json(report);
}
