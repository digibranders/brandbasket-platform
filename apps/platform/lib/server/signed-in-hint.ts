import "server-only";
import { cookies, headers } from "next/headers";
import { hintCookieOptions, SIGNED_IN_HINT_COOKIE, signedInHintValue } from "@/lib/signed-in-hint";
import { getAuth } from "./auth";
import { serverEnv, signedInHintDomain } from "./env";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

/** The signed-in marker's cookie settings for this deployment (lib/signed-in-hint.ts). */
function markerOptions(): ReturnType<typeof hintCookieOptions> {
  return hintCookieOptions({ appOrigin: serverEnv().APP_ORIGIN, domain: signedInHintDomain() });
}

/**
 * Signs a customer in with Better Auth and sets the website's signed-in marker beside the session, with their
 * initials. Every customer sign-in goes through here (the login form, a new free listing account, a setup link), so
 * the website's header knows who is signed in from the first page after. Throws whatever Better Auth throws.
 */
export async function signInCustomer(
  credentials: { readonly email: string; readonly password: string },
  requestHeaders: RequestHeaders,
): Promise<{ readonly userId: string }> {
  const result = await getAuth().api.signInEmail({ body: { ...credentials }, headers: requestHeaders });
  (await cookies()).set(SIGNED_IN_HINT_COOKIE, signedInHintValue(result.user.name), markerOptions());
  return { userId: result.user.id };
}

/** Takes the marker away on sign-out, so the website's header goes back to Log in at once. */
export async function forgetSignedIn(): Promise<void> {
  (await cookies()).set(SIGNED_IN_HINT_COOKIE, "", { ...markerOptions(), maxAge: 0 });
}
