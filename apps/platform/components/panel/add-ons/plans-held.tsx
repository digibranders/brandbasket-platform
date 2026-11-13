import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/** How many of the three plans are held, toward Dedicated Expert Monitoring at no cost: a short segment per plan, filled for each one held, and the count in words. */
export function PlansHeld({ held, total }: { readonly held: number; readonly total: number }): ReactElement {
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-1.5" role="img" aria-label={`${held} of ${total} plans`}>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < held ? "bg-sage" : "bg-sunken")} />
        ))}
      </div>
      <p className="text-[0.8125rem] text-ink-2">{`You have ${held} of ${total} plans.`}</p>
    </div>
  );
}
