import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import Link from "next/link";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { SetupForm } from "@/features/entry/components/setup-form";
import { BRAND } from "@/features/entry/rules/brand";
import { findInviteForToken } from "@/features/entry/server/setup";

export const metadata: Metadata = { title: "Set up your account", referrer: "no-referrer" };

// Never cached: the page shows the invite's email address, and the token is in the address.
export const dynamic = "force-dynamic";

/** A staff setup link. The token is the guard: valid, expired or used, or rate limited for this network. */
export default async function SetupPage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  // A temporary lookup limit keeps this same link usable after the window resets.
  const invite = await findInviteForToken(token);

  if (invite === null) {
    return (
      <EntryScreen title="This link no longer works." lede="Setup links work once and expire after 7 days. Ask us for a new one and we'll send it straight away.">
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
        <a href={`/setup/${encodeURIComponent(token)}`} className="type-body">
          Try this link again
        </a>
      </EntryScreen>
    );
  }

  return (
    <EntryScreen title={`Welcome to ${BRAND.shortName}.`} lede={`Finish setting up ${invite.businessName} with ${invite.email}.`}>
      <SetupForm siteKey={turnstileSiteKey()} token={token} />
    </EntryScreen>
  );
}
