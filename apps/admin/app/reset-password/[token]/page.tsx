import type { Metadata } from "next";
import type { ReactElement } from "react";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ResetPasswordForm } from "@/components/auth/recovery-forms";
import { resetPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  return (
    <AuthFrame title="Choose a new password" description="You will sign in again on all your devices.">
      <TurnstileScope><ResetPasswordForm action={resetPasswordAction} token={token} /></TurnstileScope>
    </AuthFrame>
  );
}
