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
    <AuthFrame title="Forgot password?" description="It happens. Enter your work email and we'll send you a link to get back in.">
      <TurnstileScope><ForgotPasswordForm action={requestPasswordResetAction} /></TurnstileScope>
    </AuthFrame>
  );
}
