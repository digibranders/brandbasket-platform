import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { ResetPasswordForm } from "@/features/entry/components/reset-password-form";

// The token is in the address: keep it out of the Referer of anything the page links to.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export const dynamic = "force-dynamic";

/**
 * Where a reset email's link lands. Public: the token is the guard, and it is only checked when the form is sent (that is
 * what uses it up), so a used link still shows the form and then says it no longer works.
 */
export default async function ResetPasswordPage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  return (
    <EntryScreen title="Choose a new password." lede="You'll be signed out everywhere else, then sign in with the new one.">
      <ResetPasswordForm siteKey={turnstileSiteKey()} token={token} />
    </EntryScreen>
  );
}
