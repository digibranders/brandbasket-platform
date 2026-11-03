import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUpHrefFromLogin, type SearchParams } from "@/features/entry/rules/account-entry";
import { loginNotice } from "@/features/entry/rules/login-notice";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { NoBusiness } from "@/features/entry/components/no-business";
import { SignInForm } from "@/features/entry/components/sign-in-form";
import { signedInEntry } from "@/features/entry/server/entry-access";

export const metadata: Metadata = { title: "Sign in" };

// Never cached: it reads the session.
export const dynamic = "force-dynamic";

/** Sign in. Public. A sign-up link (the old single page's `new=1`, a plan, an ad's token) goes on to /signup. */
export default async function LoginPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const signUp = signUpHrefFromLogin(params);
  if (signUp !== null) redirect(signUp);
  const signedIn = await signedInEntry(false);
  if (signedIn?.kind === "elsewhere") redirect(signedIn.href);
  if (signedIn?.kind === "no-business") return <NoBusiness label={signedIn.label} />;
  return (
    <EntryScreen title="Sign in" lede="Use the email or mobile number you signed up with.">
      <SignInForm siteKey={turnstileSiteKey()} notice={loginNotice(params.notice)} />
    </EntryScreen>
  );
}
