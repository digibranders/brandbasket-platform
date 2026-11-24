import { NextResponse } from "next/server";
import { emailQueueToken } from "@/platform/lib/server/email-queue";
import { liveSocialAutoCatchUpDeps, runSocialAutoCatchUp } from "@/platform/lib/server/social-auto-catch-up";
import { hasValidWebsiteToken } from "@/platform/lib/server/website-api-auth";

// Never cached or prerendered: it sends notices.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/social-auto-catch-up`: reads the events social-auto holds that the webhook did not deliver and acts on each
 * once (docs/notifications/04-social-auto-events.md). Called every 15 minutes by a scheduled job with the same
 * `Authorization: Bearer <EMAIL_QUEUE_TOKEN>` as the email queue. 503 when that token is not configured, 401 for a wrong one.
 * With no webhook secret or no social-auto address it answers 200 `skipped` and does nothing; the report is the body.
 */
export async function POST(request: Request): Promise<Response> {
  const token = emailQueueToken();
  if (token === null) return NextResponse.json({ error: "The scheduled jobs are not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  return NextResponse.json(await runSocialAutoCatchUp(liveSocialAutoCatchUpDeps()));
}
