import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { retryMessage } from "@brandbasket/shared/lib/sign-in-limits";
import { QuietFrame } from "@/components/console/quiet-frame";
import { StaffInviteForm } from "@/components/staff-invite-form";
import { signOut } from "@/lib/server/sign-out";
import { viewStaffInvite } from "@/lib/server/staff-invite-accept";

export const metadata: Metadata = { title: "Join the console", robots: { index: false, follow: false } };

/** Where an invite link lands: outside the signed-in area, because the person may not have an account yet. */
export default async function StaffInvitePage({ params }: { readonly params: Promise<{ readonly token: string }> }): Promise<ReactElement> {
  const { token } = await params;
  const view = await viewStaffInvite(token);

  if (view.kind === "limited") return <QuietFrame title="Too many tries" lede={retryMessage(view.retryAfterSeconds)} />;
  if (view.kind === "gone") return <QuietFrame title="This invite no longer works" lede="It was used, replaced or has expired. Ask the person who runs Brandbasket for a new invite." />;

  const lede = `You were invited with ${view.invite.email}.`;
  if (view.mode === "sign-in-first") {
    return (
      <QuietFrame title="Sign in first" lede={`${lede} This email already has an account. Sign in with it, then open this link again.`}>
        <p className="text-center">
          <Link href="/login" className="link-underline font-semibold">
            Sign in
          </Link>
        </p>
      </QuietFrame>
    );
  }
  if (view.mode === "wrong-account") {
    return (
      <QuietFrame title="Signed in with another account" lede={`${lede} Sign out, then open this link again.`}>
        <div className="flex justify-center py-2">
          <SignOutButton signOut={signOut} />
        </div>
      </QuietFrame>
    );
  }
  return (
    <QuietFrame title="Set up your sign in" lede={lede}>
      <TurnstileScope>
        <StaffInviteForm token={token} mode={view.mode} />
      </TurnstileScope>
    </QuietFrame>
  );
}
