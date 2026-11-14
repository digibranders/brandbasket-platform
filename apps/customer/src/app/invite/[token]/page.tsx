import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { SignOutButton } from "@/features/entry/components/sign-out-button";
import { AcceptInvite } from "@/features/team/components/accept-invite";
import { loadInviteForToken } from "@/features/team/loader";
import {
  inviteSignInHref,
  inviteSignUpHref,
  inviteTokenSchema,
  refusalMessage,
  refusalTitle,
} from "@/features/team/rules";
import { getSessionUser } from "@/lib/session";
import { LinkButton } from "@/ui";

export const metadata: Metadata = { title: "Join a team", referrer: "no-referrer" };

// Never cached: it reads the session, and the token is in the address.
export const dynamic = "force-dynamic";

/**
 * Accepting an invitation to a business. The token is the guard; the person must be signed in with the address that was
 * invited. Opening the link changes nothing: the invitation is used only when the button is pressed, so a link scanner or a
 * preview cannot use it up. Signed out, the person is sent to sign in or create an account and comes back here.
 *
 * Before showing the Join button, the invitation is checked: expired, used, withdrawn, or wrong-address invitations are
 * refused with a plain-words explanation.
 */
export default async function InvitePage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  if (!inviteTokenSchema.safeParse(token).success) {
    return (
      <EntryScreen title={refusalTitle("not_found")} lede={refusalMessage("not_found")}>
        <LinkButton href="/login" size="lg">
          Go to sign in
        </LinkButton>
      </EntryScreen>
    );
  }

  const user = await getSessionUser();
  const inviteCheck = await loadInviteForToken(token, user?.email);

  if (user === null) {
    if (inviteCheck.kind === "refused") {
      return (
        <EntryScreen title={refusalTitle(inviteCheck.reason)} lede={refusalMessage(inviteCheck.reason)}>
          <LinkButton href="/login" size="lg">
            Go to sign in
          </LinkButton>
        </EntryScreen>
      );
    }

    return (
      <EntryScreen
        title="You have been invited to join a team."
        lede="Sign in with the email address the invitation was sent to, or create an account with it."
      >
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

  if (inviteCheck.kind === "refused") {
    return (
      <EntryScreen title={refusalTitle(inviteCheck.reason)} lede={refusalMessage(inviteCheck.reason)}>
        <div className="flex flex-col gap-2">
          <LinkButton href="/" size="lg">
            Go to dashboard
          </LinkButton>
          <SignOutButton />
        </div>
      </EntryScreen>
    );
  }

  return (
    <EntryScreen
      title="Join the team."
      lede={`You are signed in as ${user.email}. The invitation only works for the address it was sent to.`}
    >
      <AcceptInvite token={token} />
      <div className="flex flex-col gap-1.5">
        <p className="type-meta">Not the right address?</p>
        <SignOutButton />
      </div>
    </EntryScreen>
  );
}
