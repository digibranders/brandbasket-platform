"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactElement } from "react";
import { OnboardingStepList } from "@/components/panel/onboarding-step-list";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";

interface OnboardingStepsProps {
  readonly completed: readonly OnboardingStepKey[];
}

/** The step list for the onboarding layout, which cannot see its own page: the current step comes from the URL. */
export function OnboardingSteps({ completed }: OnboardingStepsProps): ReactElement {
  const segment = useSelectedLayoutSegment();
  const current = ONBOARDING_STEPS.find((step) => step.key === segment)?.key ?? "business";
  return <OnboardingStepList current={current} completed={completed} />;
}
