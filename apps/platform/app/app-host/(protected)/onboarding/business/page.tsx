import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { BusinessStepForm, type SavedBusinessProfile } from "@/components/panel/business-step-form";
import { BusinessSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepHeading } from "@/components/panel/step-heading";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { phoneCountryOptions } from "@firstfold/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@firstfold/shared/server/phone-defaults";
import { saveBusinessStep } from "./actions";

export const metadata: Metadata = { title: "Your business" };

export default async function BusinessStepPage(): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.locked) {
    return (
      <>
        <StepHeading step="business" />
        <SummaryCard title="Your business">
          <BusinessSummary profile={snapshot.profile} hours={snapshot.hours} />
        </SummaryCard>
      </>
    );
  }

  const saved = snapshot.profile;
  // The saved number shows in its own country's layout; with nothing saved, the visitor's country is the best guess.
  const savedPhone = savedPhoneStart(saved?.phone ?? null);
  const defaultPhoneCountry = savedPhone.country ?? visitorPhoneCountry(await headers());
  const profile: SavedBusinessProfile = {
    displayName: saved?.displayName ?? tenant.businessName,
    tagline: saved?.tagline ?? null,
    description: saved?.description ?? null,
    phone: savedPhone.number === "" ? null : savedPhone.number,
    email: saved?.email ?? null,
    addressLine1: saved?.addressLine1 ?? null,
    addressLine2: saved?.addressLine2 ?? null,
    city: saved?.city ?? null,
    region: saved?.region ?? null,
    postalCode: saved?.postalCode ?? null,
    country: saved?.country ?? null,
    serviceAreas: saved?.serviceAreas ?? null,
    googleBusinessUrl: saved?.googleBusinessUrl ?? null,
  };

  return (
    <>
      <StepHeading step="business" />
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <BusinessStepForm
          action={saveBusinessStep}
          profile={profile}
          hours={snapshot.hours}
          phoneCountries={phoneCountryOptions()}
          defaultPhoneCountry={defaultPhoneCountry}
        />
      </div>
    </>
  );
}
