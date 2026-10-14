import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { findNominee } from "@fynix/db";
import { ButtonLink } from "@fynix/shared/ui/panel/button";
import { SectionHeading, Surface } from "@fynix/shared/ui/panel/surface";
import { displayPhone } from "@fynix/shared/server/phone-display";
import { NomineeForm } from "@/components/panel/nominee-form";
import { legalLinksFor } from "@/lib/legal-links";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { PRIVACY_EXPORT_PATH } from "@/lib/privacy-settings-form";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { clearNomineeAction, saveNomineeAction } from "./actions";

export const metadata: Metadata = { title: "Your privacy" };

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <Surface>
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-5">{children}</div>
    </Surface>
  );
}

/** What the person can do about their own data: get a copy, name a nominee, or ask us to correct, delete or answer a complaint. */
export default async function PrivacySettingsPage(): Promise<ReactElement> {
  const brand = await requestBrand();
  const legalLinks = legalLinksFor(brand);
  const supportEmail = supportEmailOf(brand);
  const { user } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const nominee = await findNominee(getAppDb(), user.id);

  return (
    <>
      <h1 className="panel-title">Your privacy</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        What we hold about you, and what you can do about it. How we use it is in the{" "}
        <a href={legalLinks.privacy} className="link-underline text-ink">
          privacy notice
        </a>
        .
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Section title="Download your data">
          <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
            A copy of your account, your business&rsquo;s details, what you have been billed, your support requests, where you signed in from and who we
            share your data with, as one file. It does not include your password, or the details of the people your business deals with, which are in your
            dashboard.
          </p>
          <div className="mt-5">
            <ButtonLink href={PRIVACY_EXPORT_PATH} variant="secondary" size="sm" prefetch={false} download>
              Download my data
            </ButtonLink>
          </div>
        </Section>

        <Section title="Name someone to act for you">
          <NomineeForm
            save={saveNomineeAction}
            clear={clearNomineeAction}
            current={nominee === null ? null : { name: nominee.name, phoneText: displayPhone(nominee.phone).text }}
          />
        </Section>

        <Section title="Correct, delete or complain">
          <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
            You can change your password and see your name and number on the{" "}
            <a href="/settings" className="link-underline text-ink">
              Settings
            </a>{" "}
            page. To correct something else, have your data deleted, or make a complaint, send us a request. We check it is you with a code texted to your
            number and reply within 30 days.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <ButtonLink href={legalLinks.privacyRequest} variant="secondary" size="sm">
              Make a privacy request
            </ButtonLink>
            <a href={`mailto:${supportEmail}`} className="link-underline text-sm text-ink">
              Or write to us at {supportEmail}
            </a>
          </div>
        </Section>
      </div>
    </>
  );
}
