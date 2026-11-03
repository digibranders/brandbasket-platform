import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { ForgotPasswordForm } from "@/features/entry/components/forgot-password-form";
import { getEntryAccess } from "@/features/entry/server/entry-access";

export const metadata: Metadata = { title: "Reset your password" };

export const dynamic = "force-dynamic";

/** Public. Asks for the email or mobile number the account signs in with, and emails a one-time link to choose a new password. */
export default async function ForgotPasswordPage() {
  if ((await getEntryAccess()).kind === "granted") redirect("/");
  return (
    <EntryScreen title="Forgot your password?" lede="Tell us the email or mobile number you sign in with and we'll email you a link to choose a new password.">
      <ForgotPasswordForm siteKey={turnstileSiteKey()} />
    </EntryScreen>
  );
}
