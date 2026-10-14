import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { TurnstileScope } from "@firstfold/shared/ui/turnstile-scope";
import { requestBrand } from "@/lib/server/request-brand";
import { EntryScreen } from "@/components/panel/entry-screen";
import { SetupForm } from "@/components/panel/setup-form";
import { findAffiliateInviteForToken } from "@/lib/server/affiliate-setup";
import { completeAffiliateSetup } from "./actions";

export const metadata: Metadata = { title: "Open your affiliate account", referrer: "no-referrer" };

// Never cached: the page renders the affiliate's email address, and the token is in the URL.
export const dynamic = "force-dynamic";

export default async function AffiliateSetupPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  const brand = await requestBrand();
  // A temporary lookup limit keeps this same link usable after the window resets.
  const invite = await findAffiliateInviteForToken(token);

  if (invite === null) {
    return (
      <EntryScreen
        title={
          <>
            This link no longer <em>works.</em>
          </>
        }
        lede="These links work once and expire after 7 days. Ask us for a new one and we'll send it straight away."
      >
        <Link href="/login" className="link-underline">
          Go to sign in
        </Link>
      </EntryScreen>
    );
  }

  if ("kind" in invite) {
    const minutes = Math.max(1, Math.ceil(invite.retryAfterSeconds / 60));
    return (
      <EntryScreen title={<>Try this link <em>again soon.</em></>}
        lede={`Too many setup links have been opened from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`}>
        <a href={`/affiliate/setup/${encodeURIComponent(token)}`} className="link-underline">Try this link again</a>
      </EntryScreen>
    );
  }

  const choosingNewPassword = invite.userId !== null;
  return (
    <EntryScreen
      title={
        choosingNewPassword ? (
          <>
            Choose a new <em>password.</em>
          </>
        ) : (
          <>
            Welcome to <em>{brand.shortName}.</em>
          </>
        )
      }
      lede={
        choosingNewPassword
          ? `Set a new password for ${invite.email}.`
          : `Finish linking ${invite.email} to your affiliate dashboard.`
      }
    >
      <TurnstileScope>
        <SetupForm
          action={completeAffiliateSetup}
          token={token}
          turnstileAction="affiliate_setup"
          initialName={invite.name}
          askName={!choosingNewPassword}
          submitLabel={choosingNewPassword ? "Save password" : "Create my account"}
          pendingLabel={choosingNewPassword ? "Saving…" : "Creating your account…"}
        />
      </TurnstileScope>
    </EntryScreen>
  );
}
