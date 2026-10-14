import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { EntryScreen } from "@/components/panel/entry-screen";
import { SignInForm } from "@firstfold/shared/ui/panel/sign-in-form";
import { TurnstileScope } from "@firstfold/shared/ui/turnstile-scope";
import { SignOutButton } from "@firstfold/shared/ui/panel/sign-out-button";
import { siteConfig } from "@firstfold/shared/lib/site-config";
import { EntrySwitch } from "@/components/panel/entry-switch";
import { JoinForm } from "@/components/panel/join-form";
import { loginNotice } from "@/lib/login-notice";
import { requestBrand } from "@/lib/server/request-brand";
import { readEntryRequest } from "@/lib/account-entry";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { FORGOT_PASSWORD_PATH } from "@/lib/account-recovery-form";
import { claimedBusinessName, LISTING_KEY_PATTERN, PLACE_ID_PATTERN } from "@/lib/directory-api";
import { membershipPathFor, membershipPriceLine, membershipTierForChoice } from "@/lib/membership";
import { AFFILIATE_PATH } from "@firstfold/shared/lib/affiliate-links";
import { accountLabel } from "@/lib/server/account-label";
import { getAffiliateAccess } from "@/lib/server/affiliate-access";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { emailCodeBypassed, signupOtpBypassed } from "@/lib/server/env";
import { brandText } from "@/lib/brand";
import { legalLinksFor } from "@/lib/legal-links";
import { checkClaimLink, type ClaimLink } from "@/lib/server/listing-account";
import { getMembershipPlan } from "@/lib/server/membership";
import { signOut } from "@/lib/server/sign-out";
import { joinForListing, signInCustomer } from "./actions";

export const metadata: Metadata = { title: "Sign in or create your account" };

// Never cached: it reads the session, and a claim link's signature is checked against the address it arrived with.
export const dynamic = "force-dynamic";

const CLAIM_LINK_FAILED_MESSAGE =
  "That claim link didn\u2019t work. Open your business\u2019s page on Firstfold Local and tap \u201cClaim this business\u201d again, or create your account below and add your business.";

/**
 * The claim a link asks for, when it is shaped like one: a name and exactly one of a listing key or a place id. Null
 * otherwise. The signature and the place are checked by checkClaimLink.
 */
function claimLinkOf(listing: string, id: string, businessName: string, signature: string): ClaimLink | null {
  if (businessName === "") return null;
  if (id === "" && LISTING_KEY_PATTERN.test(listing)) return { listing, businessName, signature };
  if (listing === "" && PLACE_ID_PATTERN.test(id)) return { placeId: id, businessName, signature };
  return null;
}

interface AppLoginPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The one entry page (docs/superpowers/specs/2026-09-30-single-entry-premium-design.md). Everyone signs in here, and
 * everyone creates their account here, choosing the free listing, the Care plan or the Premium membership. The
 * Create account view shows the three at once (docs/superpowers/specs/2026-10-07-care-plan-design.md).
 *
 * A business's page on Firstfold Local links to it as a claim (`listing`, `name` and the website's signature over
 * both); the website's plan buttons link to it with `plan=care` or `plan=premium`. Someone already signed in goes to
 * their dashboard, or to the plan's page when that is what they came for.
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
            identifier={brand.signUpWith === "email" ? "customer-email" : "phone-or-email"}
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

  const [carePlan, premiumPlan] = await Promise.all([getMembershipPlan("care"), getMembershipPlan("premium")]);
  const prices = {
    care: carePlan === null ? null : membershipPriceLine(carePlan),
    premium: premiumPlan === null ? null : membershipPriceLine(premiumPlan),
  };
  // While codes are not sent (SIGNUP_OTP_BYPASS, or EMAIL_CODE_BYPASS under Fynix) the form must not promise one.
  const textsCodes = brand.signUpWith === "email" ? !emailCodeBypassed() : !signupOtpBypassed();

  const { listing, id, signature } = entry.claim;
  const businessName = claimedBusinessName(entry.claim.name);
  const claimAsked = listing !== "" || id !== "" || businessName !== "";
  // A claim is only taken from a link the directory's own page made: the business (its listing key or its permanent
  // id, never both) and the name it is claimed under are signed, so neither can be typed into the address bar. A
  // place that cannot be claimed (it has an owner already) is refused here too, rather than after the code is texted.
  const link = claimLinkOf(listing, id, businessName, signature);
  const claimCheck = link === null ? null : await checkClaimLink(link);
  const claimValid = claimCheck?.ok === true;
  const claimMessage = claimCheck !== null && !claimCheck.ok ? claimCheck.message : null;

  if (claimValid) {
    return (
      <EntryScreen
        title={
          <>
            Claim <em>{businessName}.</em>
          </>
        }
        lede="Create your account with the business's mobile number: we'll call it to confirm it's yours."
        switcher={<EntrySwitch current="create" />}
      >
        <TurnstileScope>
          <JoinForm
            action={joinForListing}
            listing={listing === "" ? null : listing}
            placeId={id === "" ? null : id}
            businessName={businessName}
            signature={signature}
            initialChoice={entry.choice}
            preselected={entry.preselected}
            choices={brand.joinChoices}
            legalLinks={legalLinks}
            prices={prices}
            signUpWith={brand.signUpWith}
            textsCodes={textsCodes}
          />
        </TurnstileScope>
      </EntryScreen>
    );
  }

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
      {claimAsked ? (
        <p role="alert" className="mb-5 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {brandText(claimMessage ?? CLAIM_LINK_FAILED_MESSAGE, brand)}
        </p>
      ) : null}
      <TurnstileScope>
        <JoinForm
          action={joinForListing}
          listing={null}
          placeId={null}
          businessName=""
          signature=""
          initialChoice={entry.choice}
          preselected={entry.preselected}
          choices={brand.joinChoices}
          legalLinks={legalLinks}
          prices={prices}
          signUpWith={brand.signUpWith}
          textsCodes={textsCodes}
        />
      </TurnstileScope>
    </EntryScreen>
  );
}
