import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { findNominee } from "@brandbasket/db";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { NomineeForm } from "@/components/panel/nominee-form";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageFrame, PageSection } from "@/components/v2/page";
import { legalLinksFor } from "@/lib/legal-links";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { PRIVACY_EXPORT_PATH } from "@/lib/privacy-settings-form";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { clearNomineeAction, saveNomineeAction } from "./actions";

export const metadata: Metadata = { title: "Your privacy" };

/** What the person can do about their own data: get a copy, name a nominee, or ask us to correct, delete or answer a complaint. */
export default async function PrivacySettingsPage(): Promise<ReactElement> {
  const brand = await requestBrand();
  const legalLinks = legalLinksFor(brand);
  const supportEmail = supportEmailOf(brand);
  const { user } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const nominee = await findNominee(getAppDb(), user.id);

  return (
    <PageFrame
      title="Your privacy"
      width="form"
      lede={
        <>
          What we hold about you, and what you can do about it. How we use it is in the{" "}
          <a href={legalLinks.privacy} className="font-semibold text-ink underline underline-offset-[3px]">
            privacy notice
          </a>
          .
        </>
      }
    >
      <PageSection id="download" title="Download your data">
        <p className="max-w-xl text-sm leading-relaxed text-ink-2">
          A copy of your account, your business&rsquo;s details, what you have been billed, your support requests, where you signed in from and who we
          share your data with, as one file. It does not include your password, or the details of the people your business deals with, which are in your
          dashboard.
        </p>
        <div className="mt-5">
          <Link href={PRIVACY_EXPORT_PATH} prefetch={false} download className={SOFT_BUTTON}>
            Download my data
          </Link>
        </div>
      </PageSection>

      <PageSection id="nominee" title="Name someone to act for you">
        <NomineeForm
          save={saveNomineeAction}
          clear={clearNomineeAction}
          current={nominee === null ? null : { name: nominee.name, phoneText: displayPhone(nominee.phone).text }}
        />
      </PageSection>

      <PageSection id="requests" title="Correct, delete or complain">
        <p className="max-w-xl text-sm leading-relaxed text-ink-2">
          You can change your password and see your name and number on the{" "}
          <a href="/settings" className="font-semibold text-ink underline underline-offset-[3px]">
            Settings
          </a>{" "}
          page. To correct something else, have your data deleted, or make a complaint, send us a request. We check it is you with a code emailed to the address you give and reply within 30 days.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href={legalLinks.privacyRequest} className={SOFT_BUTTON}>
            Make a privacy request
          </Link>
          <a href={`mailto:${supportEmail}`} className="font-semibold text-ink underline underline-offset-[3px]">
            Or write to us at {supportEmail}
          </a>
        </div>
      </PageSection>
    </PageFrame>
  );
}
