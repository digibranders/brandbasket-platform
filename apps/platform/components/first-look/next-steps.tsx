import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { firstLookSteps } from "@/lib/first-look-steps";
import { SECTION_TITLE } from "@/components/v2/classes";

const MARK = { done: "bg-ink text-white", now: "bg-rattan text-ink", later: "bg-sunken text-ink-2" } as const;
const SAID = { done: "Done: ", now: "Now: ", later: "" } as const;

interface NextStepsProps {
  readonly hasWebsite: boolean;
  readonly callStartIso: string | null;
  readonly booked: boolean;
}

export function NextSteps({ hasWebsite, callStartIso, booked }: NextStepsProps): ReactElement {
  const rows = firstLookSteps({ hasWebsite, callStartIso, booked });
  return (
    <section aria-labelledby="next-steps-title">
      <h2 id="next-steps-title" className={SECTION_TITLE}>
        What happens next
      </h2>
      <ol className="mt-1">
        {rows.map((row, index) => (
          <li key={row.title} className="relative grid grid-cols-[1.625rem_minmax(0,1fr)_auto] gap-3 py-2.5">
            {index < rows.length - 1 ? (
              <span aria-hidden="true" className={cn("absolute bottom-[-0.625rem] left-[0.75rem] top-[2.125rem] w-0.5", row.state === "done" ? "bg-ink" : "bg-line")} />
            ) : null}
            <span aria-hidden="true" className={cn("relative z-[1] grid size-[1.625rem] place-items-center rounded-full text-[0.8125rem] tabular-nums", MARK[row.state])}>
              {row.state === "done" ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                <span className="sr-only">{SAID[row.state]}</span>
                {row.title}
              </span>
              <span className="block text-[0.8125rem] text-ink-2">{row.note}</span>
            </span>
            <span className="whitespace-nowrap font-figure text-xs text-ink-2">{row.when}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
