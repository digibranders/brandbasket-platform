import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SECTION_TITLE } from "@/components/v2/classes";
import type { StepState, TimelineStep } from "@/lib/website/timeline";

const MARK: Readonly<Record<StepState, string>> = { done: "bg-ink text-white", now: "bg-rattan text-ink", next: "bg-sunken text-ink-2" };
const SAID: Readonly<Record<StepState, string>> = { done: "Done: ", now: "Now: ", next: "" };

/** "What happens next": the first look's step list (components/first-look/next-steps.tsx) fed by the project's own steps and dates. */
export function Timeline({ steps }: { readonly steps: readonly TimelineStep[] }): ReactElement {
  return (
    <section aria-labelledby="timeline-title">
      <h2 id="timeline-title" className={SECTION_TITLE}>
        What happens next
      </h2>
      <ol className="mt-1">
        {steps.map((step, index) => (
          <li key={step.key} aria-current={step.state === "now" ? "step" : undefined} className="relative grid grid-cols-[1.625rem_minmax(0,1fr)_auto] gap-3 py-2.5">
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className={cn("absolute bottom-[-0.625rem] left-[0.75rem] top-[2.125rem] w-0.5", step.state === "done" ? "bg-ink" : "bg-line")} />
            ) : null}
            <span aria-hidden="true" className={cn("relative z-[1] grid size-[1.625rem] place-items-center rounded-full text-[0.8125rem] tabular-nums", MARK[step.state])}>
              {step.state === "done" ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                <span className="sr-only">{SAID[step.state]}</span>
                {step.title}
              </span>
              {step.note === null ? null : <span className="block text-[0.8125rem] text-ink-2">{step.note}</span>}
            </span>
            <span className="whitespace-nowrap font-figure text-xs text-ink-2">{step.when}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
