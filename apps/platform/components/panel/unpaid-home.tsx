import type { ReactElement } from "react";
import type { BillingBannerModel } from "@brandbasket/shared/lib/billing/payment-step";
import type { NextStep } from "@brandbasket/shared/lib/next-step";
import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { BillingBanner } from "./billing-banner";
import { NextStepCard } from "./next-step-card";
import { PrepareChecklist } from "./prepare-checklist";

/** The line under the greeting for an account that has not paid or whose access has lapsed. */
const SUBTITLES: Readonly<Record<NextStep["kind"], string>> = {
  "start-onboarding": "Let’s get your business online.",
  "continue-onboarding": "Let’s get your business online.",
  building: "Your website is on its way.",
  "on-hold": "We’ll be in touch soon.",
  review: "Your website is ready for you to look at.",
  approved: "Your website is nearly live.",
  live: "Your website is live.",
  none: "Welcome back.",
};

interface UnpaidHomeProps {
  readonly firstName: string;
  readonly banner: BillingBannerModel | null;
  readonly step: NextStep;
  readonly buildStageIndex: number;
  readonly completedSteps: readonly OnboardingStepKey[];
}

/**
 * Home for an account with no access (not paid yet, or lapsed): the payment banner and where the website stands, never
 * the Overview or To do, which are for paid accounts. While the setup is not sent, the steps to complete come with it.
 */
export function UnpaidHome({ firstName, banner, step, buildStageIndex, completedSteps }: UnpaidHomeProps): ReactElement {
  const settingUp = step.kind === "start-onboarding" || step.kind === "continue-onboarding";
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-6">
      <header>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Hello, {firstName}.</h1>
        <p className="mt-2 text-[0.84375rem] text-ink-2">{SUBTITLES[step.kind]}</p>
      </header>
      {banner === null ? null : <BillingBanner banner={banner} />}
      <NextStepCard step={step} buildStageIndex={buildStageIndex} />
      {settingUp ? <PrepareChecklist completedSteps={completedSteps} /> : null}
    </div>
  );
}
