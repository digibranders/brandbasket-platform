import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { formatStepNumber } from "@brandbasket/shared/lib/format";
import { ONBOARDING_STEPS, onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";

interface OnboardingStepListProps {
  readonly current: OnboardingStepKey;
  readonly completed: readonly OnboardingStepKey[];
}

/**
 * The five steps as five bars (the Requests stepper's look): ink once done, rattan for the step the customer is on, soft
 * for the ones to come. Each is a link, so people can move between steps freely rather than being marched through. On a
 * phone the names would not fit, so only the current one is written, under the bars.
 */
export function OnboardingStepList({ current, completed }: OnboardingStepListProps): ReactElement {
  const done = new Set(completed);
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const currentTitle = ONBOARDING_STEPS[currentIndex]?.title ?? "";

  return (
    <nav aria-label="Setup steps" className="grid gap-1">
      <ol className="grid grid-cols-5 gap-1.5">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = done.has(step.key);
          return (
            <li key={step.key}>
              <Link
                href={onboardingStepHref(step.key)}
                aria-current={isCurrent ? "step" : undefined}
                className="group grid gap-2 rounded-md py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rattan"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 rounded-full transition-colors duration-200",
                    isCurrent ? "bg-rattan" : isDone ? "bg-ink" : "bg-sunken group-hover:bg-line",
                  )}
                />
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 text-[0.8125rem] max-sm:sr-only",
                    isCurrent || isDone ? "font-semibold text-ink" : "font-medium text-ink-2 group-hover:text-ink",
                  )}
                >
                  {isDone ? (
                    <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0 text-sage" />
                  ) : (
                    <span aria-hidden="true" className="font-figure text-xs tabular-nums">
                      {formatStepNumber(index)}
                    </span>
                  )}
                  <span className="truncate">{step.title}</span>
                  <span className="sr-only">{isDone ? " (done)" : isCurrent ? " (current step)" : " (to do)"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p aria-hidden="true" className="text-[0.8125rem] font-semibold text-ink sm:hidden">
        Step {formatStepNumber(currentIndex)} of {String(ONBOARDING_STEPS.length).padStart(2, "0")}
        {`: ${currentTitle}`}
      </p>
    </nav>
  );
}
