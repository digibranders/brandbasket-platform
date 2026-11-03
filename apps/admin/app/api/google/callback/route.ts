import { saveGoogleConnection } from "@brandbasket/db";
import { staffCan } from "@brandbasket/shared/lib/access";
import { exchangeCode, GoogleAccessLost, GoogleUnavailable, scopesFor } from "@brandbasket/shared/server/google/oauth";
import { sealSecret } from "@brandbasket/shared/server/secret-seal";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { googleOAuthConfig } from "@/lib/server/google-admin";
import { GOOGLE_FLOW_COOKIE, unpackGoogleFlow } from "@/lib/server/google-flow";
import { getStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { settingsNoticeHref, type SettingsNotice } from "@/lib/settings-notices";

export const runtime = "nodejs";

/** Where Google sends staff back. The state must match the signed cookie from the same admin, then the code is traded, the
 * account is checked against the one this console accepts, every permission asked for must have been given, and only then is
 * the refresh token sealed and stored. Anything else stores nothing and says why on the Settings page. */
export async function GET(request: Request): Promise<Response> {
  const env = serverEnv();
  const origin = new URL(env.ADMIN_ORIGIN).origin;
  const back = async (notice: SettingsNotice): Promise<Response> => {
    (await cookies()).delete({ name: GOOGLE_FLOW_COOKIE, path: "/api/google" });
    return NextResponse.redirect(new URL(settingsNoticeHref(notice), origin), 303);
  };

  const access = await getStaffAccess();
  if (access.kind !== "granted") return NextResponse.redirect(new URL("/login", origin), 303);
  if (!staffCan(access.staff.role, "integrations")) return new Response("Only an admin can connect the Google account.", { status: 403 });

  const config = googleOAuthConfig();
  if (config === null) return back("google-not-configured");

  const params = new URL(request.url).searchParams;
  const flow = unpackGoogleFlow(env.BETTER_AUTH_SECRET, (await cookies()).get(GOOGLE_FLOW_COOKIE)?.value, access.user.id, new Date());
  if (flow === null || params.get("state") !== flow.state) return back("google-failed");
  const code = params.get("code");
  if (params.get("error") !== null || code === null) return back("google-cancelled");

  try {
    const exchanged = await exchangeCode({ clientId: config.clientId, clientSecret: config.clientSecret }, { code, verifier: flow.verifier, redirectUri: config.redirectUri });
    if (exchanged.accountEmail !== config.accountEmail) return back("google-wrong-account");
    if (!scopesFor(flow.purpose).every((scope) => exchanged.scopes.includes(scope) || scope === "openid" || scope === "email")) return back("google-missing-permission");
    await saveGoogleConnection(getStaffDb(), {
      slot: 1,
      purpose: flow.purpose,
      accountEmail: exchanged.accountEmail,
      scopes: exchanged.scopes,
      sealedRefreshToken: sealSecret(env.BETTER_AUTH_SECRET, exchanged.refreshToken),
      staffUserId: access.user.id,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof GoogleAccessLost || error instanceof GoogleUnavailable) return back("google-failed");
    throw error;
  }
  await recordStaffAction(access satisfies GrantedStaff, { businessId: null, kind: "settings.google_connected", summary: flow.purpose === "read" ? "Connected the Google account for reading" : "Connected the Google account for setting up sites" });
  return back("google-connected");
}
