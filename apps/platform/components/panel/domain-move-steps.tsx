import type { ReactElement } from "react";
import { TickIcon } from "@fynix/shared/ui/icons";
import { MOVE_STEPS } from "@/lib/domain-page";

/** The four steps of moving to a domain of your own, with the ones done ticked and the current one marked. */
export function DomainMoveSteps({ current }: { readonly current: number }): ReactElement {
  return (
    <ol aria-label="Moving to your own domain" className="mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
      {MOVE_STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                done ? "bg-accent text-paper" : active ? "bg-accent-pale text-accent-deep ring-2 ring-inset ring-accent" : "text-ink-soft ring-2 ring-inset ring-ink-soft/50"
              }`}
            >
              {done ? <TickIcon className="size-3.5" /> : index + 1}
            </span>
            <span className={active ? "font-medium text-ink" : done ? "text-ink" : "text-ink-soft"}>
              {label}
              <span className="sr-only">{done ? " (done)" : active ? " (now)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
