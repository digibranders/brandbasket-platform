import Link from "next/link";
import type { ReactElement } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { cn } from "@brandbasket/shared/lib/cn";
import {
  ANSWER_STEPS,
  ONBOARDING_STEPS,
  onboardingStepHref,
  type OnboardingStepKey,
} from "@brandbasket/shared/lib/onboarding/steps";

interface PrepareChecklistProps {
  readonly completedSteps: readonly OnboardingStepKey[];
}

/** What each step's link says: the verb for what is still to do there. */
const ACTION: Readonly<Record<OnboardingStepKey, string>> = {
  business: "Add details",
  content: "Add services",
  brand: "Add photos",
  domain: "Choose",
  review: "Review",
};

/**
 * What to have ready for the kickoff call: the setup steps, with how far along they are. The steps are the same ones the
 * Set up your website page walks through, so what a customer does here is what the team will use. Each row says its state
 * in words as well as in its mark.
 */
export function PrepareChecklist({ completedSteps }: PrepareChecklistProps): ReactElement {
  const done = new Set(completedSteps);
  const readyCount = ANSWER_STEPS.filter((step) => done.has(step)).length;
  const percent = Math.round((readyCount / ANSWER_STEPS.length) * 100);

  return (
    <section aria-labelledby="prepare-heading" className="rounded-shell bg-paper-deep p-6 sm:p-8">
      <h2 id="prepare-heading" className="panel-title">
        Get ready for your call
      </h2>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={ANSWER_STEPS.length}
        aria-valuenow={readyCount}
        aria-valuetext={`${String(readyCount)} of ${String(ANSWER_STEPS.length)} steps ready`}
        className="mt-5 h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-calm" style={{ width: `${String(percent)}%` }} />
      </div>
      <p className="mt-2 text-sm text-ink-soft tabular-nums">
        {readyCount} of {ANSWER_STEPS.length} ready. Your answers save as you go.
      </p>
      <ol className="mt-4 divide-y divide-line">
        {ONBOARDING_STEPS.map((step, index) => {
          const isDone = done.has(step.key);
          return (
            <li key={step.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-4 py-4">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-7 items-center justify-center rounded-full text-[0.8125rem] font-medium tabular-nums",
                  isDone ? "bg-success text-paper" : "bg-card text-ink shadow-[inset_0_0_0_2px_var(--color-line)]",
                )}
              >
                {isDone ? <TickIcon className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink-soft">{step.blurb}</p>
              </div>
              {isDone ? (
                <p className="mt-0.5 text-sm font-medium text-success-deep">
                  Done<span className="sr-only">: {step.title}</span>
                </p>
              ) : (
                <Link href={onboardingStepHref(step.key)} className="link-underline mt-0.5 whitespace-nowrap text-sm font-medium text-ink">
                  {ACTION[step.key]}
                  <span className="sr-only">: {step.title}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
