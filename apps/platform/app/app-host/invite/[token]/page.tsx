import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import { AcceptInvite } from "@/components/panel/team/accept-invite";
import { EntryScreen } from "@/components/panel/entry-screen";
import { DARK_BUTTON } from "@/components/v2/classes";
import { accountLabel } from "@/lib/server/account-label";
import { getSessionUser } from "@/lib/server/session";
import { signOut } from "@/lib/server/sign-out";
import { inviteSignInHref, inviteViewFor, refusalMessage } from "@/lib/team/rules";
import { acceptInviteAction } from "./actions";

export const metadata: Metadata = { title: "Join a team", referrer: "no-referrer" };

// Never cached: it reads the session, and the token is in the address.
export const dynamic = "force-dynamic";

interface InvitePageProps {
  readonly params: Promise<{ readonly token: string }>;
}

/**
 * Accepting an invitation to a business. The token is the guard; the person must be signed in with the address that was
 * invited. Signed out, the person is sent to sign in and comes back here. There is no sign-up path: sign-up opens its own business.
 */
export default async function InvitePage({ params }: InvitePageProps): Promise<ReactElement> {
  const { token } = await params;
  // A link that is not shaped like ours never reads the session.
  if (inviteViewFor(token, false) === "invalid-link") {
    return (
      <EntryScreen title="This invitation link is not valid." lede={refusalMessage("not_found")}>
        <Link href="/login" className={DARK_BUTTON}>
          Go to sign in
        </Link>
      </EntryScreen>
    );
  }
  const user = await getSessionUser();
  if (inviteViewFor(token, user !== null) === "sign-in" || user === null) {
    return (
      <EntryScreen title="You have been invited to join a team." lede="Sign in with the email address the invitation was sent to.">
        <Link href={inviteSignInHref(token)} className={DARK_BUTTON}>
          Sign in
        </Link>
      </EntryScreen>
    );
  }
  return (
    <EntryScreen title="Join the team." lede={`You are signed in as ${accountLabel(user)}. The invitation only works for the address it was sent to.`}>
      <div className="grid gap-6">
        <AcceptInvite action={acceptInviteAction.bind(null, token)} />
        <div className="grid gap-2">
          <p className="text-sm text-ink-2">Not the right address?</p>
          <SignOutButton signOut={signOut} />
        </div>
      </div>
    </EntryScreen>
  );
}
