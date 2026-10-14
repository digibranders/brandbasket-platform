import { NextResponse } from "next/server";
import { parseEraseRunRequest } from "@/lib/account-erase-request";
import { runAccountErasure } from "@/lib/account-erasure-run";
import { accountEraseToken } from "@/lib/server/account-erase-auth";
import { realErasureDeps } from "@/lib/server/account-erasure";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it deletes people's data.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/erase-closed-accounts[?dryRun=1][&limit=N]`: the 30-day erase of accounts whose owners asked to
 * delete them. Called once a day by a scheduled job with `Authorization: Bearer <ACCOUNT_ERASE_TOKEN>`; see
 * docs/account-erasure.md. It answers 503 when that secret is not configured, 401 for a missing or wrong one, and 400
 * for a query it does not understand. Lives under /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  const token = accountEraseToken();
  if (token === null) return NextResponse.json({ error: "The erase job is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const parsed = parseEraseRunRequest(new URL(request.url));
  if (parsed === null) return NextResponse.json({ error: "dryRun must be 0 or 1 and limit a whole number from 1 to 100." }, { status: 400 });

  const report = await runAccountErasure(realErasureDeps(), { now: new Date(), limit: parsed.limit, dryRun: parsed.dryRun });
  return NextResponse.json(report);
}
