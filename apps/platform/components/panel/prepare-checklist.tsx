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

const REVIEW_STEP = ONBOARDING_STEPS.find((step) => step.key === "review") ?? { key: "review", title: "Check and send", blurb: "" };

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
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="prepare-heading" className="panel-section">
            Get ready for your call
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft tabular-nums">
            {readyCount} of {ANSWER_STEPS.length} ready. Your answers save as you go.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto">
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={ANSWER_STEPS.length}
            aria-valuenow={readyCount}
            aria-valuetext={`${String(readyCount)} of ${String(ANSWER_STEPS.length)} steps ready`}
            className="h-2 w-full overflow-hidden rounded-full bg-line sm:w-56"
          >
            <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-calm" style={{ width: `${String(percent)}%` }} />
          </div>
          <Link href={onboardingStepHref("review")} className="link-underline whitespace-nowrap text-sm font-medium text-ink">
            {REVIEW_STEP.title}
          </Link>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ANSWER_STEPS.map((key) => {
          const step = ONBOARDING_STEPS.find((candidate) => candidate.key === key);
          if (step === undefined) return null;
          const isDone = done.has(key);
          return (
            <li key={key} className="flex flex-col gap-1.5 rounded-card bg-card p-5">
              <p className={cn("inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold", isDone ? "text-success-deep" : "text-ink-soft")}>
                {isDone ? <TickIcon className="size-4 shrink-0" /> : null}
                {isDone ? "Done" : "To do"}
              </p>
              <p className="text-[0.9375rem] font-medium text-ink">{step.title}</p>
              <p className="text-sm leading-snug text-ink-soft">{step.blurb}</p>
              <Link href={onboardingStepHref(key)} className="link-underline mt-auto self-start whitespace-nowrap pt-2 text-sm font-medium text-ink">
                {isDone ? "Change" : ACTION[key]}
                <span className="sr-only">: {step.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
