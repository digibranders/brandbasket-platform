import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PageSection } from "@/components/v2/page";
import type { DomainStep, DomainStepStatus } from "@/lib/domain-page";

const MARK: Readonly<Record<DomainStepStatus, string>> = { done: "bg-ink text-white", now: "bg-rattan text-ink", next: "bg-sunken text-ink-2" };
const SAID: Readonly<Record<DomainStepStatus, string>> = { done: "Done: ", now: "Now: ", next: "" };

/** Where the domain stands, as four steps with the one the customer is on marked and what each asks of them. */
export function DomainSteps({ steps }: { readonly steps: readonly DomainStep[] }): ReactElement {
  return (
    <PageSection id="domain-steps" title="Where it stands">
      <ol aria-label="Getting your own domain">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={step.status === "now" ? "step" : undefined} className="relative grid grid-cols-[1.625rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className={cn("absolute bottom-0 left-[0.75rem] top-[1.875rem] w-0.5", step.status === "done" ? "bg-ink" : "bg-line")} />
            ) : null}
            <span aria-hidden="true" className={cn("relative z-[1] grid size-[1.625rem] place-items-center rounded-full text-[0.8125rem] tabular-nums", MARK[step.status])}>
              {step.status === "done" ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm text-ink", step.status === "next" ? "font-medium" : "font-semibold")}>
                <span className="sr-only">{SAID[step.status]}</span>
                {step.label}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-2">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </PageSection>
  );
}
