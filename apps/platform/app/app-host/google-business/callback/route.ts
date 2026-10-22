import { profileHref, type ProfileNotice } from "@/lib/business-profile-notices";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { googleBusinessCredentials } from "@/lib/server/env";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { exchangeGoogleCode, fetchGoogleLocations, GoogleBusinessError, toImportedLocation } from "@/lib/server/google-business";
import { googleImportOrigin, rememberGoogleImport, takeGoogleState } from "@/lib/server/google-import-cookie";
import { GOOGLE_CALLBACK_PATH } from "../paths";

/**
 * Where Google sends the owner back (docs/superpowers/specs/2026-10-01-business-profile-design.md). The `state` must
 * be the one this browser was given; the code is traded for an access token, the business's locations are read once,
 * and the token is dropped. What was found waits in a sealed cookie for the Details tab, where nothing is saved until
 * the owner presses Save. Every failure lands on the Details tab with a notice, never an error page.
 */
export async function GET(request: Request): Promise<Response> {
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow" });
  const origin = googleImportOrigin(request);
  const back = (notice: ProfileNotice): Response => Response.redirect(new URL(profileHref("details", notice), origin), 303);

  const params = new URL(request.url).searchParams;
  if (!(await takeGoogleState(params.get("state")))) return back("google-failed");
  const code = params.get("code");
  // The owner said no on Google's screen, or Google refused: `error` is set and there is no code.
  if (code === null || code === "" || params.has("error")) return back("google-failed");
  const credentials = googleBusinessCredentials();
  if (credentials === null) return back("google-off");

  try {
    const token = await exchangeGoogleCode({ ...credentials, redirectUri: new URL(GOOGLE_CALLBACK_PATH, origin).toString() }, code);
    const locations = (await fetchGoogleLocations(token)).map(toImportedLocation);
    if (locations.length === 0) return back("google-empty");
    return back((await rememberGoogleImport(tenant.businessId, locations)) ? "google-imported" : "google-failed");
  } catch (error) {
    if (!(error instanceof GoogleBusinessError)) throw error;
    console.error("[brandbasket:google-business] import failed", errorLogInfo(error));
    return back("google-failed");
  }
}
