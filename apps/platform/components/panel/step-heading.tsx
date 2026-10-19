import type { ReactElement, ReactNode } from "react";
import { formatStepNumber } from "@brandbasket/shared/lib/format";
import { ONBOARDING_STEPS, stepInfo, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";

interface StepHeadingProps {
  readonly step: OnboardingStepKey;
  /** Replaces the step's usual one-line description. */
  readonly children?: ReactNode;
}

/** The top of each onboarding step: its number, its title and what it asks for. */
export function StepHeading({ step, children }: StepHeadingProps): ReactElement {
  const info = stepInfo(step);
  const index = ONBOARDING_STEPS.findIndex((candidate) => candidate.key === step);
  return (
    <header className="mb-8">
      <p className="text-[0.8125rem] font-semibold tabular-nums text-accent-deep">
        Step {formatStepNumber(index)} of {String(ONBOARDING_STEPS.length).padStart(2, "0")}
      </p>
      <h2 className="mt-2 font-serif text-3xl sm:text-4xl">{info.title}</h2>
      <div className="mt-2 max-w-2xl leading-relaxed text-ink-soft">{children ?? <p>{info.blurb}</p>}</div>
    </header>
  );
}
