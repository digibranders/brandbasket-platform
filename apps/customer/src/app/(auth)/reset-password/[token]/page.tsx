import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { ResetPasswordForm } from "@/features/entry/components/reset-password-form";
import { pendingResetEmail } from "@/features/entry/server/account-recovery";

// The token is in the address: keep it out of the Referer of anything the page links to.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export const dynamic = "force-dynamic";

/**
 * Where a reset email's link lands. Public: the token is the guard, and it is only checked when the form is sent (that is
 * what uses it up), so a used link still shows the form and then says it no longer works.
 */
export default async function ResetPasswordPage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  // A customer who paid first has never chosen a password: the page names their address and says so (plan 64, D3).
  const email = await pendingResetEmail(token);
  return (
    <EntryScreen
      framed
      title={email === null ? "Choose a new password." : "Set your password."}
      lede={email === null ? "You'll be signed out everywhere else, then sign in with the new one." : "Then sign in with your email and this password."}
    >
      <ResetPasswordForm siteKey={turnstileSiteKey()} token={token} email={email} />
    </EntryScreen>
  );
}
