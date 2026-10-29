import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/** The number of things waiting on the customer, beside a sidebar link or tab. Left out on the page it points to: the page already says it. */
export function CountPill({ count, current, className }: { readonly count: number | undefined; readonly current: boolean; readonly className?: string }): ReactElement | null {
  if (count === undefined || current) return null;
  return (
    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full bg-warn-wash px-1.5 font-figure text-xs font-semibold text-warn", className)}>
      <span aria-hidden="true">{count}</span>
      {/* Read as part of the link's name: "Requests, 3 waiting". */}
      <span className="sr-only">, {count} waiting</span>
    </span>
  );
}
