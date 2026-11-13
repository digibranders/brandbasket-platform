import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { SignOutButton } from "@/features/entry/components/sign-out-button";
import { AcceptInvite } from "@/features/team/components/accept-invite";
import { inviteSignInHref, inviteSignUpHref, inviteTokenSchema, refusalMessage } from "@/features/team/rules";
import { getSessionUser } from "@/lib/session";
import { LinkButton } from "@/ui";

export const metadata: Metadata = { title: "Join a team", referrer: "no-referrer" };

// Never cached: it reads the session, and the token is in the address.
export const dynamic = "force-dynamic";

/**
 * Accepting an invitation to a business. The token is the guard; the person must be signed in with the address that was
 * invited. Opening the link changes nothing: the invitation is used only when the button is pressed, so a link scanner or a
 * preview cannot use it up. Signed out, the person is sent to sign in or create an account and comes back here.
 */
export default async function InvitePage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  if (!inviteTokenSchema.safeParse(token).success) {
    return (
      <EntryScreen title="This invitation link is not valid." lede={refusalMessage("not_found")}>
        <LinkButton href="/login" size="lg">
          Go to sign in
        </LinkButton>
      </EntryScreen>
    );
  }
  const user = await getSessionUser();
  if (user === null) {
    return (
      <EntryScreen title="You have been invited to join a team." lede="Sign in with the email address the invitation was sent to, or create an account with it.">
        <div className="flex flex-col gap-2">
          <LinkButton href={inviteSignInHref(token)} variant="primary" size="lg">
            Sign in
          </LinkButton>
          <LinkButton href={inviteSignUpHref(token)} size="lg">
            Create an account
          </LinkButton>
        </div>
      </EntryScreen>
    );
  }
  return (
    <EntryScreen title="Join the team." lede={`You are signed in as ${user.email}. The invitation only works for the address it was sent to.`}>
      <AcceptInvite token={token} />
      <div className="flex flex-col gap-1.5">
        <p className="type-meta">Not the right address?</p>
        <SignOutButton />
      </div>
    </EntryScreen>
  );
}
