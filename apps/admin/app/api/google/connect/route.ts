import { staffCan } from "@brandbasket/shared/lib/access";
import { buildConsentUrl, newPkcePair, newState } from "@brandbasket/shared/server/google/oauth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";
import { googleOAuthConfig } from "@/lib/server/google-admin";
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_SECONDS, packGoogleFlow } from "@/lib/server/google-flow";
import { getStaffAccess } from "@/lib/server/staff-access";
import { settingsNoticeHref } from "@/lib/settings-notices";

export const runtime = "nodejs";

/**
 * `POST /api/google/connect` with a `purpose` of read or write: sends an admin to Google's sign-in for the Brandbasket account.
 * A route handler gets no origin check from Next, so the Origin must be the console's own (the CSRF guard). The state and the
 * PKCE verifier go in a signed cookie that only the callback reads.
 */
export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  const origin = new URL(env.ADMIN_ORIGIN).origin;
  if (request.headers.get("origin") !== origin) return new Response("That did not come from the console. Reload the page and try again.", { status: 403 });

  const access = await getStaffAccess();
  if (access.kind !== "granted") return NextResponse.redirect(new URL("/login", origin), 303);
  if (!staffCan(access.staff.role, "integrations")) return new Response("Only an admin can connect the Google account.", { status: 403 });

  const form = await request.formData();
  const purpose = form.get("purpose");
  if (purpose !== "read" && purpose !== "write") return new Response("Choose reading or setting up sites.", { status: 400 });

  const config = googleOAuthConfig();
  if (config === null) return NextResponse.redirect(new URL(settingsNoticeHref("google-not-configured"), origin), 303);

  const { verifier, challenge } = newPkcePair();
  const state = newState();
  const flow = { purpose, state, verifier, staffId: access.user.id, expiresAt: Date.now() + GOOGLE_FLOW_SECONDS * 1000 } as const;
  (await cookies()).set(GOOGLE_FLOW_COOKIE, packGoogleFlow(env.BETTER_AUTH_SECRET, flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/api/google",
    maxAge: GOOGLE_FLOW_SECONDS,
  });
  return NextResponse.redirect(buildConsentUrl({ clientId: config.clientId, redirectUri: config.redirectUri, purpose, state, challenge, loginHint: config.accountEmail }), 303);
}
