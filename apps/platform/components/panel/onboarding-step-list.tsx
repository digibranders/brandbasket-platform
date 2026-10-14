import Link from "next/link";
import type { ReactElement } from "react";
import { TickIcon } from "@fynix/shared/ui/icons";
import { cn } from "@fynix/shared/lib/cn";
import { formatStepNumber } from "@fynix/shared/lib/format";
import { ONBOARDING_STEPS, onboardingStepHref, type OnboardingStepKey } from "@fynix/shared/lib/onboarding/steps";

interface OnboardingStepListProps {
  readonly current: OnboardingStepKey;
  readonly completed: readonly OnboardingStepKey[];
}

/** The five steps, each linked, so people can move between them freely rather than being marched through. */
export function OnboardingStepList({ current, completed }: OnboardingStepListProps): ReactElement {
  const done = new Set(completed);

  return (
    <nav aria-label="Setup steps">
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = done.has(step.key);
          return (
            <li key={step.key} className="shrink-0">
              <Link
                href={onboardingStepHref(step.key)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-control px-3 py-3 transition-colors duration-300 ease-calm",
                  isCurrent ? "bg-card ring-1 ring-line" : "hover:bg-paper-deep/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                    isDone
                      ? "bg-ink text-paper"
                      : isCurrent
                        ? "bg-accent-pale text-accent-deep"
                        : "bg-paper-deep text-ink-soft",
                  )}
                >
                  {isDone ? <TickIcon className="size-4" /> : formatStepNumber(index)}
                </span>
                <span className="min-w-0">
                  <span className={cn("block whitespace-nowrap text-sm", isCurrent ? "font-medium" : "text-ink-soft")}>
                    {step.title}
                  </span>
                  <span className="sr-only">{isDone ? " (done)" : isCurrent ? " (current step)" : " (to do)"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
