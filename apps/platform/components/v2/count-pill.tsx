import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/** The open-items number beside a rail link or tab. Left out on the page it points to: the page already says it. */
export function CountPill({ count, current, className }: { readonly count: number | undefined; readonly current: boolean; readonly className?: string }): ReactElement | null {
  if (count === undefined || current) return null;
  return (
    <span aria-label={`${count} open`} className={cn("min-w-[1.25rem] rounded-full bg-rattan px-1.5 text-center font-figure text-[0.6875rem] font-semibold leading-5 text-ink", className)}>
      {count}
    </span>
  );
}
