import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { BusinessStepForm, type SavedBusinessProfile } from "@/components/panel/business-step-form";
import { BusinessSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepAside } from "@/components/panel/step-aside";
import { StepCard } from "@/components/panel/step-card";
import { PageColumns } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { saveBusinessStep } from "./actions";

export const metadata: Metadata = { title: "Your business" };

export default async function BusinessStepPage(): Promise<ReactElement> {
  const { tenant } = await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.locked) {
    return (
      <PageColumns
        main={
          <SummaryCard title="Your business">
            <BusinessSummary profile={snapshot.profile} hours={snapshot.hours} />
          </SummaryCard>
        }
        aside={<StepAside step="business" />}
      />
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
    <PageColumns
      main={
        <StepCard step="business">
          <BusinessStepForm
            action={saveBusinessStep}
            profile={profile}
            hours={snapshot.hours}
            phoneCountries={phoneCountryOptions()}
            defaultPhoneCountry={defaultPhoneCountry}
          />
        </StepCard>
      }
      aside={<StepAside step="business" />}
    />
  );
}
