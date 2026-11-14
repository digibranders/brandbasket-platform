import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/** How many steps a job has: reading the website, writing, drawing, putting it together for review. */
const STEPS = 4;

/**
 * A loading bar for work that is running in the background. It fills as the job moves on (step 1 to 4); when the posting service does not
 * say the step, it shows a bar that pulses, so something is always seen moving while the page waits.
 */
export function JobProgress({ step }: { readonly step?: number | undefined }): ReactElement {
  const known = step !== undefined && step >= 1;
  const done = known ? Math.min(step, STEPS) : 0;
  return (
    <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={STEPS} {...(known ? { "aria-valuenow": done } : {})} className="h-2 overflow-hidden rounded-full bg-surface/70">
      <div className={cn("h-full rounded-full bg-c-growth transition-[width] duration-500", !known && "w-1/3 animate-pulse")} style={known ? { width: `${(done / STEPS) * 100}%` } : undefined} />
    </div>
  );
}
