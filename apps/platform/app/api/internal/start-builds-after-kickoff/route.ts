import { NextResponse } from "next/server";
import { kickoffSyncToken, startBuildsAfterKickoff } from "@/lib/server/kickoff-sync";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it starts website builds.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/start-builds-after-kickoff`: moves the website project of every business whose kickoff call is over
 * from onboarding to submitted, with the first preview due 48 hours after the call. Called every 15 minutes by a scheduled job (docs/kickoff-builds.md) with
 * `Authorization: Bearer <KICKOFF_SYNC_TOKEN>`. It answers 503 when that secret is not configured and 401 for a missing or
 * wrong one; the report is the body, and the status is 502 when a build could not be started and 200 otherwise. Lives under
 * /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  const token = kickoffSyncToken();
  if (token === null) return NextResponse.json({ error: "The kickoff sync is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const report = await startBuildsAfterKickoff();
  return NextResponse.json(report, { status: report.failed > 0 ? 502 : 200 });
}
