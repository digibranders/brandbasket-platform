import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { StepperRow } from "@/lib/requests/status";

const BAR: Readonly<Record<StepperRow["mark"], string>> = { done: "bg-ink", now: "bg-rattan", todo: "bg-sunken" };

/** The five steps of a request, each with the date it was reached. A step is a word as well as a colour. */
export function Stepper({ rows }: { readonly rows: readonly StepperRow[] }): ReactElement {
  return (
    <ol aria-label="Where this request is" className="grid grid-cols-5 gap-1.5 border-b border-line px-5 py-4">
      {rows.map((row) => (
        <li key={row.label} aria-current={row.mark === "now" ? "step" : undefined} className="grid gap-1.5">
          <span aria-hidden="true" className={cn("h-1 rounded-full", BAR[row.mark])} />
          <span className={cn("text-[0.78125rem]", row.mark === "todo" ? "font-medium text-ink-2" : "font-semibold text-ink")}>
            {row.label}
            {row.mark === "done" ? <span className="sr-only">, reached</span> : null}
          </span>
          <span className="font-figure text-[0.71875rem] tabular-nums text-ink-2">{row.note ?? " "}</span>
        </li>
      ))}
    </ol>
  );
}
