import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ForgotPasswordForm } from "@/components/auth/recovery-forms";
import { getStaffAccess } from "@/lib/server/staff-access";
import { requestPasswordResetAction } from "./actions";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage(): Promise<ReactElement> {
  if ((await getStaffAccess()).kind === "granted") redirect("/");
  return (
    <AuthFrame title="Reset your password" description="Enter your staff email. If it belongs to a staff account, a reset link is on its way.">
      <TurnstileScope><ForgotPasswordForm action={requestPasswordResetAction} /></TurnstileScope>
    </AuthFrame>
  );
}
