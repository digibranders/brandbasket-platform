import "server-only";
import type { headers } from "next/headers";
import { getAuth } from "./auth";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

/**
 * Signs a customer in with Better Auth. Every customer sign-in goes through here (the login form, a new account, a setup
 * link). Throws whatever Better Auth throws.
 */
export async function signInCustomer(
  credentials: { readonly email: string; readonly password: string },
  requestHeaders: RequestHeaders,
): Promise<{ readonly userId: string }> {
  const result = await getAuth().api.signInEmail({ body: { ...credentials }, headers: requestHeaders });
  return { userId: result.user.id };
}
