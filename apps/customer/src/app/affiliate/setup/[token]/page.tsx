import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import Link from "next/link";
import { AffiliateSetupForm, type AffiliateSetupMode } from "@/features/affiliate/components/affiliate-setup-form";
import { findAffiliateInviteForToken, inviteEmailHasAccount } from "@/features/affiliate/server/setup";
import { EntryScreen } from "@/features/entry/components/entry-screen";

export const metadata: Metadata = { title: "Open your affiliate account", referrer: "no-referrer" };

// Never cached: the page shows the affiliate's email address, and the token is in the address.
export const dynamic = "force-dynamic";

/** An affiliate's setup link from the console. The token is the guard: valid, dead, or rate limited for this network. */
export default async function AffiliateSetupPage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  // A temporary lookup limit keeps this same link usable after the window resets.
  const invite = await findAffiliateInviteForToken(token);

  if (invite === null) {
    return (
      <EntryScreen title="This link no longer works." lede="These links work once and expire after 7 days. Ask us for a new one and we'll send it straight away.">
        <Link href="/login" className="type-body">
          Go to sign in
        </Link>
      </EntryScreen>
    );
  }

  if ("kind" in invite) {
    const minutes = Math.max(1, Math.ceil(invite.retryAfterSeconds / 60));
    return (
      <EntryScreen title="Try this link again soon." lede={`Too many setup links have been opened from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`}>
        <a href={`/affiliate/setup/${encodeURIComponent(token)}`} className="type-body">
          Try this link again
        </a>
      </EntryScreen>
    );
  }

  const choosingNewPassword = invite.userId !== null;
  // Someone who already has a Brandbasket account is asked for its password, not to make a second account.
  const linkingExisting = !choosingNewPassword && (await inviteEmailHasAccount(invite.email));
  const mode: AffiliateSetupMode = choosingNewPassword ? "new-password" : linkingExisting ? "link-existing" : "create";
  const title = choosingNewPassword ? "Choose a new password." : "Welcome to Brandbasket.";
  const lede = choosingNewPassword
    ? `Set a new password for ${invite.email}.`
    : linkingExisting
      ? `${invite.email} already has a Brandbasket account. Enter its password to add your affiliate dashboard to it.`
      : `Finish linking ${invite.email} to your affiliate dashboard.`;
  return (
    <EntryScreen title={title} lede={lede}>
      <AffiliateSetupForm siteKey={turnstileSiteKey()} token={token} initialName={invite.name} mode={mode} />
    </EntryScreen>
  );
}
