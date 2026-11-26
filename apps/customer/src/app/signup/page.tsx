import { countryOptions } from "@brandbasket/shared/lib/countries";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignupCheckoutScreen } from "@/features/checkout/components/signup-checkout-screen";
import { AuthFrame } from "@/features/entry/components/auth-frame";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { NoBusiness } from "@/features/entry/components/no-business";
import { SignUpForm } from "@/features/entry/components/sign-up-form";
import { inviteReturn, readEntryRequest, type SearchParams } from "@/features/entry/rules/account-entry";
import { signUpPanelCopy } from "@/features/entry/rules/signup-panel";
import { openStart, START_PARAM } from "@/features/entry/rules/start-token";
import { emailCodeBypassed, leadsApiToken } from "@/features/entry/server/env";
import { signedInEntry, unpaidSignupOwner } from "@/features/entry/server/entry-access";
import { getPendingSignupCookie } from "@/features/entry/server/pending-signup-cookie";
import { loadSignUpBasket } from "@/features/entry/server/signup-prices";
import { loadSignupCheckoutBasket, loadSignupCheckoutBasketFor } from "@/features/entry/server/signup-checkout-basket";
import { visitorCountry } from "@/features/entry/server/visitor-country";

export const metadata: Metadata = { title: "Create your account" };

// Never cached: it reads the session.
export const dynamic = "force-dynamic";

/**
 * Sign up. Public. A new visitor gets the one-screen checkout: choose the services, give the details and pay, and the account
 * opens as the payment starts (plan 64). Links name the services their basket chose (`plan=website,growth`), older ones
 * `plan=managed` and `addons=`; an ad landing page adds its sealed `start` token. A teammate sent here by an invitation
 * (`next=/invite/...`) pays nothing, so they keep the account form. A signed-in owner whose sign-up has not paid sees the same
 * screen in its signed-in mode (Pay only): it is also what the first post's own re-render of this page must show, or that
 * redirect would race the payment. Anyone else already signed in goes to their workspace, or to checkout when the link names
 * a plan.
 */
export default async function SignUpPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const entry = readEntryRequest(params);
  const invite = inviteReturn(params.next);
  const signedIn = await signedInEntry(entry.choice !== null);
  const unpaid = invite === null && signedIn?.kind === "elsewhere" ? await unpaidSignupOwner() : null;
  if (signedIn?.kind === "elsewhere" && unpaid === null) redirect(signedIn.href);
  if (signedIn?.kind === "no-business") return <NoBusiness label={signedIn.label} />;

  const requestHeaders = await headers();
  // No secret, a repeated parameter or a bad token all mean no prefill.
  const startToken = params[START_PARAM];
  const secret = leadsApiToken();
  const prefill = typeof startToken === "string" && secret !== null ? openStart(startToken, secret) : null;
  const sealedStart = prefill?.attr === undefined || typeof startToken !== "string" ? null : startToken;
  const phoneCountries = phoneCountryOptions().map((option) => ({ code: option.code, label: `${option.name} ${option.dialCode}`, dialCode: option.dialCode }));
  const defaultPhoneCountry = visitorPhoneCountry(requestHeaders);

  if (invite === null) {
    // The link's services first, then the basket the questions were last asked for, then none.
    const linkNamesServices = [params.plan, params.addons].some((value) => typeof value === "string" && value !== "");
    return (
      <SignupCheckoutScreen
        account={unpaid === null ? "new" : "signed-in"}
        table={unpaid === null ? loadSignupCheckoutBasket(visitorCountry(requestHeaders)) : loadSignupCheckoutBasketFor(unpaid.currency)}
        initialServices={unpaid === null || linkNamesServices ? entry.services : unpaid.savedServices}
        details={{ siteKey: turnstileSiteKey(), phoneCountries, defaultPhoneCountry, prefill, startToken: sealedStart }}
      />
    );
  }

  const panelCopy = signUpPanelCopy(entry.services, true);
  const pendingStep = await getPendingSignupCookie();
  const basket = await loadSignUpBasket(entry.services);
  return (
    <AuthFrame>
      <EntryScreen title={panelCopy.heading.title} lede={panelCopy.heading.lede}>
        <SignUpForm
          siteKey={turnstileSiteKey()}
          services={entry.services}
          basket={basket}
          // With the local bypass on any six digits are accepted, so the form must not promise a real check.
          confirmsCodes={!emailCodeBypassed()}
          countries={countryOptions().map((option) => ({ value: option.code, label: option.name }))}
          phoneCountries={phoneCountries}
          defaultPhoneCountry={defaultPhoneCountry}
          prefill={prefill}
          next={invite}
          startToken={sealedStart}
          initialStep={pendingStep}
        />
      </EntryScreen>
    </AuthFrame>
  );
}
