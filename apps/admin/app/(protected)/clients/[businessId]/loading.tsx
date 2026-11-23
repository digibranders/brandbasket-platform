import type { ReactElement } from "react";
import { Skeleton } from "@brandbasket/shared/ui/patterns";

/** A client's workspace while it loads: the name, the tab strip and the focal card, as blocks the size of the real ones. */
export default function Loading(): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label="Loading client">
      <Skeleton width={260} height={32} rounded="control" />
      <Skeleton width={360} height={16} rounded="control" className="mt-3" />
      <Skeleton height={40} rounded="control" className="mt-6" />
      <Skeleton height={96} className="mt-8" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
      <span className="sr-only">Loading client</span>
    </div>
  );
}
