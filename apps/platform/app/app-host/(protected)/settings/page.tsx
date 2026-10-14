import type { Metadata } from "next";
import { brandText } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import type { ReactElement, ReactNode } from "react";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { SignOutButton } from "@firstfold/shared/ui/panel/sign-out-button";
import { ChangePasswordForm } from "@/components/panel/change-password-form";
import { DELETE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { PRIVACY_SETTINGS_PATH } from "@/lib/privacy-settings-form";
import { changePasswordAction, revokeOtherSessionsAction } from "./actions";
import { SectionHeading, Surface, type SurfaceTone } from "@firstfold/shared/ui/panel/surface";
import { signOut } from "@/lib/server/sign-out";
import { describePlanTerms } from "@firstfold/shared/lib/billing/terms";
import { BILLING_CURRENCY_LABELS } from "@firstfold/shared/lib/currency";
import { accountLabel } from "@/lib/server/account-label";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Settings" };

function Section({
  title,
  tone,
  children,
}: {
  readonly title: string;
  readonly tone?: SurfaceTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Surface tone={tone}>
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-5">{children}</div>
    </Surface>
  );
}

/**
 * A label above its value. The label is the quiet half: it was the same size as the value it introduces, which
 * left a column of facts with no clear reading order. Quiet by size and colour (13px, ink-soft), not by being a tiny
 * uppercase eyebrow: the label is part of what is read.
 */
function Facts({ items }: { readonly items: readonly { readonly label: string; readonly value: ReactNode }[] }): ReactElement {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[0.8125rem] text-ink-soft">{item.label}</dt>
          <dd className="mt-1.5 break-words text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The customer's account at a glance, with the password, signing out and deleting the account. */
export default async function SettingsPage(): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess({ listingAccount: "allow" });
  const brand = await requestBrand();
  const listingAccount = (await getCustomerBusinessKind(tenant.userId, tenant.businessId)) === "listing";

  return (
    <>
      <h1 className="panel-title">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">Your account and the business it belongs to.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Section title="Your account">
          <Facts
            items={[
              { label: "Name", value: user.name },
              user.phone === null ? { label: "Email", value: user.email } : { label: "Mobile number", value: accountLabel(user) },
            ]}
          />
        </Section>

        {/* A free listing account has no plan to show: it pays per ad spot, on Billing. */}
        {listingAccount ? (
          <Section title="Your business">
            <Facts
              items={[
                // Until its owner adds it on the Listing page, a business carries its owner's name as a stand-in.
                { label: "Business", value: tenant.businessName === user.name ? "Not added yet" : tenant.businessName },
                { label: "Account", value: brandText("Free listing on Firstfold Local", brand) },
              ]}
            />
          </Section>
        ) : (
          <Section title="Your business">
            <Facts
              items={[
                { label: "Business", value: tenant.businessName },
                {
                  label: "Billed in",
                  value: billing.plan === null ? "Not set yet" : BILLING_CURRENCY_LABELS[billing.plan.currency],
                },
                ...(billing.plan === null ? [] : [{ label: "Your plan", value: describePlanTerms(billing.plan) }]),
              ]}
            />
          </Section>
        )}

        <Section title="Password">
          <ChangePasswordForm action={changePasswordAction} revokeAction={revokeOtherSessionsAction} />
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-soft">
            To change the {user.phone === null ? "email" : "mobile number"} you sign in with, email us at{" "}
            <EmailUs />
            .
          </p>
        </Section>

        <div className="grid content-start gap-4">
          <Section title="Session" tone="quiet">
            <SignOutButton signOut={signOut} />
          </Section>

          <Section title="Your privacy" tone="quiet">
            <p className="max-w-xl text-sm text-ink-soft">Download your data, name someone to act for you, or ask us to correct or delete it.</p>
            <div className="mt-5">
              <ButtonLink href={PRIVACY_SETTINGS_PATH} variant="secondary" size="sm">
                Your privacy
              </ButtonLink>
            </div>
          </Section>

          <Section title="Delete account" tone="quiet">
            <p className="max-w-xl text-sm text-ink-soft">Close your account and end your plan.</p>
            <div className="mt-5">
              <ButtonLink href={DELETE_ACCOUNT_PATH} variant="secondary" size="sm">
                Delete account
              </ButtonLink>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
