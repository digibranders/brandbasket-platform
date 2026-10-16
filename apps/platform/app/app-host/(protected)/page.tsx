import type { Metadata } from "next";
import type { ReactElement } from "react";
import { BillingBanner } from "@/components/panel/billing-banner";
import { FeaturePreview } from "@/components/panel/feature-preview";
import { NextStepCard } from "@/components/panel/next-step-card";
import { firstName } from "@fynix/shared/lib/names";
import { nextStep, type NextStep } from "@fynix/shared/lib/next-step";
import { tourStageStates } from "@/lib/plan-tour";
import { projectStageIndex } from "@/lib/project-stages";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";

export const metadata: Metadata = { title: "Home" };

const SUBTITLES: Readonly<Record<NextStep["kind"], string>> = {
  "start-onboarding": "Let’s get your business online.",
  "continue-onboarding": "Let’s get your business online.",
  building: "Your website is on its way.",
  "on-hold": "We’ll be in touch soon.",
  live: "Your website is live.",
  none: "Welcome back.",
};

export default async function AppHomePage(): Promise<ReactElement> {
  const { user, billing } = await requireCustomerAccess();
  const [overview, banner, liveWebsite] = await Promise.all([
    getProjectOverview(),
    getBillingBanner(),
    getLiveWebsite(),
  ]);
  const { project, completed } = overview;
  const step = nextStep({ project, completedSteps: completed, liveWebsite });
  // Going live closes the project, so `overview.project` is null from launch onwards and the live site is the only
  // thing that still knows the status. Without this both the build list and the tour below fall back to the state
  // they show a customer who has not started, on the very screen that tells them their website is up.
  const status = liveWebsite === null ? (project?.status ?? null) : "live";
  const submitted = project?.onboardingSubmittedAt != null;

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-center">
        <div>
          <h1 className="panel-title">
            Hello, <em>{firstName(user.name)}.</em>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">{SUBTITLES[step.kind]}</p>
        </div>
        {banner === null ? null : <BillingBanner banner={banner} />}
      </div>

      <div className="mt-8">
        <NextStepCard
          step={step}
          completedSteps={completed}
          buildStageIndex={status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null })}
        />
      </div>

      <section aria-labelledby="what-happens-heading" className="mt-10">
        <h2 id="what-happens-heading" className="panel-section">
          What happens from here
        </h2>
        <div className="mt-6">
          <FeaturePreview
            states={tourStageStates({ status, completedSteps: completed.length, submitted })}
            locked={!billing.hasAccess}
          />
        </div>
      </section>
    </>
  );
}
