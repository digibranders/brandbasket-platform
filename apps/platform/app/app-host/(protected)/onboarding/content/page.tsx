import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ContentStepForm } from "@/components/panel/content-step-form";
import { ContentSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepHeading } from "@/components/panel/step-heading";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { saveContentStep } from "./actions";

export const metadata: Metadata = { title: "What you offer" };

export default async function ContentStepPage(): Promise<ReactElement> {
  const { billing } = await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.locked) {
    return (
      <>
        <StepHeading step="content" />
        <SummaryCard title="What you offer">
          <ContentSummary services={snapshot.services} brief={snapshot.brief} />
        </SummaryCard>
      </>
    );
  }

  return (
    <>
      <StepHeading step="content" />
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <ContentStepForm
          action={saveContentStep}
          currency={billing.plan?.currency ?? null}
          services={snapshot.services.map((service) => ({
            id: service.id,
            name: service.name,
            summary: service.summary,
            priceText: service.priceText,
          }))}
          brief={{
            notesForBuilder: snapshot.brief?.notesForBuilder ?? null,
            styleLikes: snapshot.brief?.styleLikes ?? null,
            referenceUrls: snapshot.brief?.referenceUrls ?? [],
          }}
        />
      </div>
    </>
  );
}
