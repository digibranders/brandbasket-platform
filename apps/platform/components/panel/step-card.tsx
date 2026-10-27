import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { stepInfo, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { LIFT } from "@/components/v2/classes";

interface StepCardProps {
  readonly step: OnboardingStepKey;
  /** Replaces the step's usual one-line description. */
  readonly intro?: ReactNode;
  readonly children: ReactNode;
}

/** The one raised card of a setup step: the step's title and what it asks for, then its form. */
export function StepCard({ step, intro, children }: StepCardProps): ReactElement {
  const info = stepInfo(step);
  return (
    <section aria-labelledby={`${step}-step-title`} className={cn(LIFT, "min-w-0")}>
      <header className="border-b border-line px-5 py-5 md:px-8">
        <h2 id={`${step}-step-title`} className="font-display text-[1.25rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
          {info.title}
        </h2>
        <div className="mt-1.5 max-w-2xl text-[0.84375rem] leading-relaxed text-ink-2">{intro ?? <p>{info.blurb}</p>}</div>
      </header>
      {children}
    </section>
  );
}
