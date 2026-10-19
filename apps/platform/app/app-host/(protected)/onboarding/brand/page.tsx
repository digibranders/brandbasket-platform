import type { MediaAsset } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { BrandStepForm, type UploadedImage } from "@/components/panel/media-uploader";
import { BrandSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepHeading } from "@/components/panel/step-heading";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { removeBrandImage, saveBrandStep } from "./actions";

export const metadata: Metadata = { title: "Logo and photos" };

/** Only what the page shows goes to the browser; the storage key and checksum stay on the server. */
function uploadedImage(asset: MediaAsset): UploadedImage {
  return {
    id: asset.id,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    originalFilename: asset.originalFilename,
  };
}

export default async function BrandStepPage(): Promise<ReactElement> {
  await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.locked) {
    return (
      <>
        <StepHeading step="brand" />
        <SummaryCard title="Logo and photos">
          <BrandSummary logo={snapshot.logo} photos={snapshot.photos} />
        </SummaryCard>
      </>
    );
  }

  return (
    <>
      <StepHeading step="brand">
        <p>
          The pictures that will make it look like you. Add your logo, your photos, or both. Every photo needs a short
          description, which is read out to people who can’t see it.
        </p>
      </StepHeading>
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <BrandStepForm
          action={saveBrandStep}
          remove={removeBrandImage}
          logo={snapshot.logo === null ? null : uploadedImage(snapshot.logo)}
          photos={snapshot.photos.map(uploadedImage)}
        />
      </div>
    </>
  );
}
