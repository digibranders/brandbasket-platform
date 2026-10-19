import type { Metadata } from "next";
import type { ReactElement } from "react";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { EntryScreen } from "@/components/panel/entry-screen";
import { ResetPasswordForm } from "@/components/panel/reset-password-form";
import { resetPasswordAction } from "./actions";

// The token is in the address: keep it out of the Referer of anything the page links to.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export const dynamic = "force-dynamic";

/**
 * Where a reset email's link lands. The token is only checked when the form is sent (that is what uses it up), so a
 * link that has already been used still shows the form, and then says it no longer works.
 */
export default async function ResetPasswordPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  return (
    <EntryScreen
      title={
        <>
          Choose a new <em>password.</em>
        </>
      }
      lede="You'll be signed out everywhere else, then sign in with the new one."
    >
      <TurnstileScope>
        <ResetPasswordForm action={resetPasswordAction} token={token} />
      </TurnstileScope>
    </EntryScreen>
  );
}
