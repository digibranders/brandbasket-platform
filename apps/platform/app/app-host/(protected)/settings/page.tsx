import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import type { Subscription } from "@brandbasket/db";
import { nextBundledNetCents, websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import type { CustomerBillingStatus } from "@brandbasket/shared/lib/billing/status";
import { inFirstTerm } from "@brandbasket/shared/lib/billing/period";
import { describePlanTerms } from "@brandbasket/shared/lib/billing/terms";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { EmailUs } from "@/components/panel/email-us";
import { ChangePasswordForm } from "@/components/panel/change-password-form";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { ActionRow, FactRows, PageFrame, PageSection } from "@/components/v2/page";
import { DELETE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { PRIVACY_SETTINGS_PATH } from "@/lib/privacy-settings-form";
import { accountLabel } from "@/lib/server/account-label";
import { findReactivationNetCents } from "@/lib/server/billing";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import { signOut } from "@/lib/server/sign-out";
import { changePasswordAction, revokeOtherSessionsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

/**
 * What the plan's terms are read against, since the plan row itself costs nothing: a paying customer's services from the next
 * renewal, a lapsed customer's the basket a reactivation restores (`reactivationNetCents`), otherwise the website alone,
 * which is what Check and send takes.
 */
function serviceNetCents(
  status: CustomerBillingStatus,
  subscription: Subscription | null,
  currency: MoneyCurrency,
  reactivationNetCents: number | null,
): number {
  if (status === "paid" && subscription !== null) return nextBundledNetCents(subscription);
  return reactivationNetCents ?? websiteAloneNetCents(currency);
}

/** Whether the first payment is behind the customer: a lapsed plan has had one, a paid one once its first term has run out. */
function pastFirstTerm(status: CustomerBillingStatus, subscription: Subscription | null, now: Date): boolean {
  if (status === "lapsed") return true;
  return status === "paid" && subscription !== null && !inFirstTerm(subscription, now);
}

/** The customer's account at a glance, with the password, signing out and deleting the account. Sections on the page, one dark button (Change password). */
export default async function SettingsPage(): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess({ listingAccount: "allow" });
  const listingAccount = (await getCustomerBusinessKind(tenant.userId, tenant.businessId)) === "listing";
  const reactivationNetCents = await findReactivationNetCents({ tenant, billing });

  // A free listing account has no plan to show: it pays per ad spot, on Billing.
  const businessFacts = listingAccount
    ? [
        // Until its owner adds it on the Listing page, a business carries its owner's name as a stand-in.
        { label: "Business", value: tenant.businessName === user.name ? "Not added yet" : tenant.businessName },
        { label: "Account", value: "Free listing on the local directory" },
      ]
    : [
        { label: "Business", value: tenant.businessName },
        { label: "Billed in", value: billing.plan === null ? "Not set yet" : BILLING_CURRENCY_LABELS[billing.plan.currency] },
        ...(billing.plan === null
          ? []
          : [
              {
                label: "Your plan",
                value: describePlanTerms(billing.plan, serviceNetCents(billing.status, billing.subscription, billing.plan.currency, reactivationNetCents), {
                  afterFirstTerm: pastFirstTerm(billing.status, billing.subscription, new Date()),
                }),
              },
            ]),
      ];

  return (
    <PageFrame title="Settings" lede="Your account and the business it belongs to." width="form">
      <PageSection id="account" title="Your account">
        <FactRows
          items={[
            { label: "Name", value: user.name },
            user.phone === null ? { label: "Email", value: user.email } : { label: "Mobile number", value: accountLabel(user) },
          ]}
        />
      </PageSection>

      <PageSection id="business" title="Your business">
        <FactRows items={businessFacts} />
      </PageSection>

      <PageSection id="password" title="Password">
        <ChangePasswordForm action={changePasswordAction} revokeAction={revokeOtherSessionsAction} />
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-2">
          To change the {user.phone === null ? "email" : "mobile number"} you sign in with, email us at <EmailUs />.
        </p>
      </PageSection>

      <PageSection id="privacy" title="Your privacy">
        <ActionRow
          text="Download your data, name someone to act for you, or ask us to correct or delete it."
          action={
            <Link href={PRIVACY_SETTINGS_PATH} className={SOFT_BUTTON}>
              Your privacy
            </Link>
          }
        />
      </PageSection>

      <PageSection id="delete" title="Delete account">
        <ActionRow
          text="Close your account and end your plan."
          action={
            <Link href={DELETE_ACCOUNT_PATH} className={SOFT_BUTTON}>
              Delete account
            </Link>
          }
        />
      </PageSection>

      <PageSection id="session" title="Session">
        <form action={signOut}>
          <button type="submit" className={SOFT_BUTTON}>
            Sign out
          </button>
        </form>
      </PageSection>
    </PageFrame>
  );
}
