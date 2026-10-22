import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { EntryScreen } from "@/components/panel/entry-screen";
import { SignInForm } from "@brandbasket/shared/ui/panel/sign-in-form";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import type { Plan } from "@brandbasket/db";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { EntrySwitch } from "@/components/panel/entry-switch";
import { countryOptions } from "@brandbasket/shared/lib/countries";
import { JoinForm, type PlanPricesByCurrency } from "@/components/panel/join-form";
import { loginNotice } from "@/lib/login-notice";
import { requestBrand } from "@/lib/server/request-brand";
import { readEntryRequest } from "@/lib/account-entry";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { FORGOT_PASSWORD_PATH } from "@/lib/account-recovery-form";
import { websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { membershipPathFor, membershipPriceLine, membershipTierForChoice } from "@/lib/membership";
import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { accountLabel } from "@/lib/server/account-label";
import { getAffiliateAccess } from "@/lib/server/affiliate-access";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { emailCodeBypassed } from "@/lib/server/env";

import { legalLinksFor } from "@/lib/legal-links";
import { getMembershipPlan } from "@/lib/server/membership";
import { signOut } from "@/lib/server/sign-out";
import { joinForListing, signInCustomer } from "./actions";

export const metadata: Metadata = { title: "Sign in or create your account" };

// Never cached: it reads the session.
export const dynamic = "force-dynamic";

interface AppLoginPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The one entry page. Everyone signs in here, and everyone creates their account here, choosing Managed Website.
 *
 * The website's buttons link to it with the services its basket chose (`plan=website,growth`); older links send
 * `plan=managed` and `addons=` for the add-ons on top of the website. Someone already
 * signed in goes to their dashboard, or to the plan's page when that is what they came for.
 */
export default async function AppLoginPage({ searchParams }: AppLoginPageProps): Promise<ReactElement> {
  const params = await searchParams;
  const brand = await requestBrand();
  const entry = readEntryRequest(params, brand);
  const legalLinks = legalLinksFor(brand);

  const access = await getCustomerAccess();
  // A plan's page sends a business that is already a member on to its dashboard.
  if (access.kind === "granted") {
    const wanted = membershipTierForChoice(entry.choice);
    redirect(wanted === null ? "/" : membershipPathFor(wanted));
  }
  // An account that asked to be deleted signs in to a single choice: restore it, or leave it be.
  if (access.kind === "closing") redirect(RESTORE_ACCOUNT_PATH);

  if (access.kind === "no-business") {
    // An affiliate has a sign-in and no business: their page is the coupon, not the "no business" notice.
    if ((await getAffiliateAccess()).kind === "granted") redirect(AFFILIATE_PATH);
    return (
      <EntryScreen
        title={
          <>
            Almost <em>there.</em>
          </>
        }
        lede={`${accountLabel(access.user)} is signed in, but it isn’t linked to a business yet. Contact ${brand.name} and we’ll sort it out.`}
      >
        <div className="flex flex-wrap items-center gap-6">
          <SignOutButton signOut={signOut} />
          <a href={`mailto:${brand.contactEmail ?? siteConfig.email}`} className="link-underline text-sm">
            Contact {brand.name}
          </a>
        </div>
      </EntryScreen>
    );
  }

  if (entry.view === "sign-in") {
    const noticeText = loginNotice(params.notice);
    return (
      <EntryScreen
        title={
          <>
            Welcome <em>back.</em>
          </>
        }
        lede={`Sign in to continue to your ${brand.shortName} dashboard.`}
        switcher={<EntrySwitch current="sign-in" />}
      >
        <TurnstileScope>
          <SignInForm
            action={signInCustomer}
            turnstileAction="sign_in"
            submitLabel="Sign in"
            identifier="customer-email"
            forgotPasswordHref={FORGOT_PASSWORD_PATH}
            notice={noticeText}
            agreementNote={
              <>
                By signing in you agree to the{" "}
                <a href={legalLinks.terms} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
                  Terms
                </a>{" "}
                and the{" "}
                <a href={legalLinks.privacy} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
                  Privacy Notice
                </a>
                .
              </>
            }
          />
        </TurnstileScope>
      </EntryScreen>
    );
  }

  // Both currencies: the form shows the one for the country the owner picks.
  const [india, us] = await Promise.all([getMembershipPlan("managed", "INR"), getMembershipPlan("managed", "USD")]);
  const priceLine = (plan: Plan | null): string | null => (plan === null ? null : membershipPriceLine(plan, websiteAloneNetCents(plan.currency)));
  const prices: PlanPricesByCurrency = {
    INR: { managed: priceLine(india) },
    USD: { managed: priceLine(us) },
  };
  // With the local bypass on (EMAIL_CODE_BYPASS) any six digits are accepted, so the form must not promise a real check.
  const confirmsCodes = !emailCodeBypassed();

  return (
    <EntryScreen
      title={
        <>
          Create your <em>account.</em>
        </>
      }
      lede={`One account for your business on ${brand.name}.`}
      switcher={<EntrySwitch current="create" />}
    >
      <TurnstileScope>
        <JoinForm
          action={joinForListing}
          initialChoice={entry.choice}
          services={entry.services}
          preselected={entry.preselected}
          choices={brand.joinChoices}
          legalLinks={legalLinks}
          prices={prices}
          confirmsCodes={confirmsCodes}
          countries={countryOptions()}
        />
      </TurnstileScope>
    </EntryScreen>
  );
}
