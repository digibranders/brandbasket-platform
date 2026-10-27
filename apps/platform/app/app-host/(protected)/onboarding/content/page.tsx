import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ContentStepForm } from "@/components/panel/content-step-form";
import { ContentSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepAside } from "@/components/panel/step-aside";
import { StepCard } from "@/components/panel/step-card";
import { PageColumns } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { saveContentStep } from "./actions";

export const metadata: Metadata = { title: "What you offer" };

export default async function ContentStepPage(): Promise<ReactElement> {
  const { billing } = await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();

  if (snapshot.locked) {
    return (
      <PageColumns
        main={
          <SummaryCard title="What you offer">
            <ContentSummary services={snapshot.services} brief={snapshot.brief} />
          </SummaryCard>
        }
        aside={<StepAside step="content" />}
      />
    );
  }

  return (
    <PageColumns
      main={
        <StepCard step="content">
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
        </StepCard>
      }
      aside={<StepAside step="content" />}
    />
  );
}
