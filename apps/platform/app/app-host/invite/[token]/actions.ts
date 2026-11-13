"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import { acceptInvite } from "@/lib/server/team";
import { inviteSignInHref, type AcceptInviteState } from "@/lib/team/rules";

/**
 * Accepts the invitation for the signed-in person: their email address must be the one invited. Bound to the token the
 * page holds (`acceptInviteAction.bind(null, token)`), so the form's own arguments are not needed; the token is checked again here because a bound argument is still
 * input from the browser. The user and the address come only from the session. Success goes Home.
 */
export async function acceptInviteAction(token: string): Promise<AcceptInviteState> {
  const user = await getSessionUser();
  if (user === null) redirect(inviteSignInHref(token));
  const result = await acceptInvite(user, token);
  if (!result.ok) return { status: "error", message: result.message };
  redirect("/");
}
