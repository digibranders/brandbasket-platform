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

/** Asks for the email the account signs in with, and sends it a one-time link to choose a new password. */
export default async function ForgotPasswordPage(): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind === "granted") redirect("/");
  const brand = await requestBrand();

  return (
    <EntryScreen
      title={
        <>
          Forgot your <em>password?</em>
        </>
      }
      lede="Tell us the email you sign in with and we'll email you a link to choose a new password."
    >
      <TurnstileScope>
        <ForgotPasswordForm action={requestPasswordResetAction} brandName={brand.shortName} />
      </TurnstileScope>
    </EntryScreen>
  );
}
