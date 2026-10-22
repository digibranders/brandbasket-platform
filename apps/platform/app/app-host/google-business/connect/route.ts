import { googleAuthorizeUrl } from "@/lib/server/google-business";
import { googleImportOrigin, startGoogleState } from "@/lib/server/google-import-cookie";
import { profileHref } from "@/lib/business-profile-notices";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { googleBusinessCredentials } from "@/lib/server/env";
import { GOOGLE_CALLBACK_PATH } from "../paths";

/**
 * "Import from Google Business Profile" (docs/superpowers/specs/2026-10-01-business-profile-design.md): sends the
 * signed-in free listing account to Google to choose the account that manages their business. While the import is not
 * set up, it goes back to the Details tab saying so.
 */
export async function GET(request: Request): Promise<Response> {
  await requireCustomerAccess({ listingAccount: "allow" });
  const origin = googleImportOrigin(request);
  const credentials = googleBusinessCredentials();
  if (credentials === null) return Response.redirect(new URL(profileHref("details", "google-off"), origin), 303);

  const state = await startGoogleState();
  const url = googleAuthorizeUrl({ ...credentials, redirectUri: new URL(GOOGLE_CALLBACK_PATH, origin).toString() }, state);
  return Response.redirect(url, 303);
}
