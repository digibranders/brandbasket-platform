import type { Metadata } from "next";
import type { ReactElement } from "react";
import { BillingBanner } from "@/components/panel/billing-banner";
import { FeaturePreview } from "@/components/panel/feature-preview";
import { NextStepCard } from "@/components/panel/next-step-card";
import { firstName } from "@fynix/shared/lib/names";
import { changePricing } from "@fynix/shared/lib/pricing";
import { changesNote } from "@fynix/shared/lib/billing/terms";
import { nextStep, type NextStep } from "@fynix/shared/lib/next-step";
import { tourStageStates } from "@/lib/plan-tour";
import { projectStageIndex } from "@/lib/project-stages";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getBlogPosts } from "@/lib/server/blog";
import { CareIncludes } from "@/components/panel/care-includes";
import { HomeStats } from "@/components/panel/home-stats";

export const metadata: Metadata = { title: "Home" };

/** The USD plan's change pricing, for a business whose currency has no plan to read it from. */
const DEFAULT_CHANGE_PRICING = {
  currency: "USD",
  includedChangeHours: changePricing.includedHours,
  extraHourAmountCents: changePricing.extraHourCents,
  includedBlogPosts: changePricing.includedBlogPosts,
  blogPostBlockSize: changePricing.blogPostBlockSize,
  extraBlogPostsAmountCents: changePricing.extraBlogPostsCents,
} as const;

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
  const [overview, banner, liveWebsite, posts] = await Promise.all([
    getProjectOverview(),
    getBillingBanner(),
    getLiveWebsite(),
    getBlogPosts(),
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
        <HomeStats
          status={status}
          completedSteps={completed.length}
          submitted={submitted}
          liveSince={liveWebsite?.launchedAt ?? null}
          plan={billing.plan}
          subscription={billing.subscription}
          billingPaid={billing.hasAccess}
          posts={{
            total: posts.length,
            published: posts.filter((post) => post.status === "published").length,
          }}
        />
      </div>

      <div className="mt-4">
        <NextStepCard
          step={step}
          completedSteps={completed}
          buildStageIndex={status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null })}
        />
      </div>

      {billing.tier === "care" ? <CareIncludes /> : null}

      <section aria-labelledby="what-happens-heading" className="mt-10">
        <h2 id="what-happens-heading" className="panel-section">
          What happens from here
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">What your plan includes, in order.</p>
        <div className="mt-6">
          <FeaturePreview
            states={tourStageStates({ status, completedSteps: completed.length, submitted })}
            locked={!billing.hasAccess}
            changesNote={changesNote(billing.plan ?? DEFAULT_CHANGE_PRICING)}
          />
        </div>
      </section>
    </>
  );
}
