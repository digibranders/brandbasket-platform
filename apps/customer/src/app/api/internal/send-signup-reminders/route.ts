import { NextResponse } from "next/server";
import { processSignupReminders, signupReminderToken } from "@/features/entry/server/signup-reminder-job";
import { hasValidWebsiteToken } from "@/platform/lib/server/website-api-auth";

// Never cached or prerendered: it sends reminder emails.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/send-signup-reminders`: sends one reminder email to abandoned sign-ups older than 1 day (D21).
 * Called periodically by a scheduled job with `Authorization: Bearer <SIGNUP_REMINDER_TOKEN>`.
 * Returns 503 when the secret is not configured and 401 for a missing or wrong one.
 * Returns 502 when any reminder failed to send, and 200 otherwise.
 */
export async function POST(request: Request): Promise<Response> {
  const token = signupReminderToken();
  if (token === null) return NextResponse.json({ error: "The sign-up reminder is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const report = await processSignupReminders(new Date());
  return NextResponse.json(report, { status: report.failed > 0 ? 502 : 200 });
}
