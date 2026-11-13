import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/v2/classes";
import type { ServicesGlance as ServicesGlanceView } from "@/lib/billing/added-service";

/** The strip above the services: what the next payment takes and when, and how many of the three plans are held. One column on a phone. */
export function ServicesGlance({ glance }: { readonly glance: ServicesGlanceView }): ReactElement {
  return (
    <section aria-label="Your plan at a glance" className={cn(LIFT, "grid divide-y divide-line", glance.next !== null && "@xl:grid-cols-2 @xl:divide-x @xl:divide-y-0")}>
      {glance.next === null ? null : (
        <div className="grid gap-1 p-5">
          <p className="text-[0.9375rem] text-ink-2">Next payment</p>
          <p className="font-figure text-[1.625rem] font-semibold tabular-nums text-ink">{glance.next.amount}</p>
          <p className="font-figure text-[0.9375rem] tabular-nums text-ink-2">{glance.next.on}</p>
        </div>
      )}
      <div className="grid gap-1 p-5">
        <p className="text-[0.9375rem] text-ink-2">Your plans</p>
        <p className="font-figure text-[1.625rem] font-semibold tabular-nums text-ink">
          {glance.plansHeld} <span className="text-[0.9375rem] font-normal text-ink-2">{`of ${glance.plansTotal}`}</span>
        </p>
        <p className="text-[0.9375rem] text-ink-2">Dedicated Expert Monitoring is free with all three</p>
      </div>
    </section>
  );
}
