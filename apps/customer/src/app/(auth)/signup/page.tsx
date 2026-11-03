import { countryOptions } from "@brandbasket/shared/lib/countries";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { NoBusiness } from "@/features/entry/components/no-business";
import { SignUpForm } from "@/features/entry/components/sign-up-form";
import { readEntryRequest, type SearchParams } from "@/features/entry/rules/account-entry";
import { BRAND } from "@/features/entry/rules/brand";
import { openStart, START_PARAM } from "@/features/entry/rules/start-token";
import { emailCodeBypassed, leadsApiToken } from "@/features/entry/server/env";
import { signedInEntry } from "@/features/entry/server/entry-access";
import { loadSignUpBasket } from "@/features/entry/server/signup-prices";

export const metadata: Metadata = { title: "Create your account" };

// Never cached: it reads the session.
export const dynamic = "force-dynamic";

/**
 * Create an account. Public. Links name the services their basket chose (`plan=website,growth`), older ones `plan=managed`
 * and `addons=`; an ad landing page adds its sealed `start` token. Someone already signed in goes to their workspace, or to
 * checkout when the link names a plan.
 */
export default async function SignUpPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const entry = readEntryRequest(params);
  const signedIn = await signedInEntry(entry.choice !== null);
  if (signedIn?.kind === "elsewhere") redirect(signedIn.href);
  if (signedIn?.kind === "no-business") return <NoBusiness label={signedIn.label} />;

  const basket = await loadSignUpBasket(entry.services);
  // No secret, a repeated parameter or a bad token all mean no prefill.
  const startToken = params[START_PARAM];
  const secret = leadsApiToken();
  const prefill = typeof startToken === "string" && secret !== null ? openStart(startToken, secret) : null;

  return (
    <EntryScreen title="Create your account." lede={`One account for your business on ${BRAND.name}.`}>
      <SignUpForm
        siteKey={turnstileSiteKey()}
        services={entry.services}
        basket={basket}
        // With the local bypass on any six digits are accepted, so the form must not promise a real check.
        confirmsCodes={!emailCodeBypassed()}
        countries={countryOptions().map((option) => ({ value: option.code, label: option.name }))}
        phoneCountries={phoneCountryOptions().map((option) => ({ code: option.code, label: `${option.name} ${option.dialCode}`, dialCode: option.dialCode }))}
        defaultPhoneCountry={visitorPhoneCountry(await headers())}
        prefill={prefill}
        startToken={prefill?.attr === undefined || typeof startToken !== "string" ? null : startToken}
      />
    </EntryScreen>
  );
}
