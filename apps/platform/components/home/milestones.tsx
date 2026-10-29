import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export interface Milestone {
  readonly label: string;
  /** "done", "now" or "next". */
  readonly state: "done" | "now" | "next";
  /** A real date or word under it ("Fri 30 Oct", "If you need any"), or null. */
  readonly note: string | null;
}

/** The path from kickoff to launch as a row of bars: black for done, rattan for now, grey for what is next. The word under each says the same, so the colour is never the only sign. */
export function Milestones({ items, label }: { readonly items: readonly Milestone[]; readonly label: string }): ReactElement {
  return (
    <ol aria-label={label} className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-5">
      {items.map((item) => (
        <li key={item.label} className="grid content-start gap-2">
          <span aria-hidden="true" className={cn("h-1 rounded-full", item.state === "done" ? "bg-ink" : item.state === "now" ? "bg-rattan" : "bg-line")} />
          <span className={cn("text-[0.9375rem]", item.state === "next" ? "text-ink-2" : "font-semibold text-ink")}>
            {item.label}
            <span className="sr-only">{item.state === "done" ? " (done)" : item.state === "now" ? " (now)" : " (next)"}</span>
          </span>
          {item.note === null ? null : <span className={cn("text-[0.8125rem]", item.state === "now" ? "font-semibold text-rattan-ink" : "text-ink-3")}>{item.note}</span>}
        </li>
      ))}
    </ol>
  );
}
