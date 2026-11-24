import type { ReactElement } from "react";
import { Skeleton } from "@brandbasket/shared/ui/patterns";

/** The Website tab while it loads: the stepper, the focal card and the facts row, as blocks the size of the real ones. */
export default function Loading(): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label="Loading website">
      <Skeleton height={64} />
      <Skeleton height={168} className="mt-6" />
      <Skeleton height={56} rounded="control" className="mt-6" />
      <div className="mt-6 grid gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height={44} rounded="control" />
        ))}
      </div>
      <span className="sr-only">Loading website</span>
    </div>
  );
}
