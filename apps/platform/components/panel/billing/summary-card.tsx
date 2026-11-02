import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/v2/classes";

/** One of the cards at the top of Billing (plan, payment method, billing details): a title, an optional action beside it, then what it holds. */
export function SummaryCard({
  id,
  title,
  action,
  className,
  children,
}: {
  /** Makes the heading's id (`${id}-title`), which names the card for a screen reader. */
  readonly id: string;
  readonly title: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={`${id}-title`} className={cn(LIFT, "grid content-start gap-4 p-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-title`} className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
