import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { TurnstileScope } from "@fynix/shared/ui/turnstile-scope";
import { EntryScreen } from "@/components/panel/entry-screen";
import { ForgotPasswordForm } from "@/components/panel/forgot-password-form";
import { requestBrand } from "@/lib/server/request-brand";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { requestPasswordResetAction } from "./actions";

export const metadata: Metadata = { title: "Reset your password" };

/**
 * Asks what the account signs in with: a mobile number is texted a code, an email is sent a one-time link. A brand whose
 * accounts all have an email (Fynix) asks for the email only.
 */
export default async function ForgotPasswordPage(): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind === "granted") redirect("/");
  const brand = await requestBrand();
  const emailOnly = brand.signUpWith === "email";

  return (
    <EntryScreen
      title={
        <>
          Forgot your <em>password?</em>
        </>
      }
      lede={
        emailOnly
          ? "Tell us the email you sign in with and we'll email you a link to choose a new password."
          : "Tell us the mobile number you sign in with and we'll text you a code to choose a new one. If you sign in with an email, we'll email you a link."
      }
    >
      <TurnstileScope>
        <ForgotPasswordForm action={requestPasswordResetAction} brandName={brand.shortName} emailOnly={emailOnly} />
      </TurnstileScope>
    </EntryScreen>
  );
}
