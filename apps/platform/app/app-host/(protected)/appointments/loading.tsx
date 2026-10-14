import type { ReactElement } from "react";
import { SkeletonHeading, SkeletonLine } from "@fynix/shared/ui/panel/skeleton";

/** Stands in for the Today/Week/Month/Custom segmented filter row. */
function SkeletonFilterRow(): ReactElement {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3].map((i) => (
        <SkeletonLine key={i} className="h-8 w-16 rounded-full" />
      ))}
    </div>
  );
}

/** Stands in for the Week grid: a header row of day-sized blocks, then a few slot-row-sized ones. Close enough to
 * a list view's own hairline rows (Today/Month/Custom) to stand in for either while the page doesn't yet know
 * which one it's loading. */
function SkeletonGrid(): ReactElement {
  return (
    <div className="mt-6">
      <div className="flex gap-2 border-b border-line pb-2.5">
        <SkeletonLine className="h-4 w-10 shrink-0" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonLine key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2">
            <SkeletonLine className="h-9 w-10 shrink-0" />
            {[0, 1, 2, 3, 4, 5, 6].map((j) => (
              <SkeletonLine key={j} className="h-9 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the real page's shape: a heading, the big new-booking number, the view filter row (with Add booking and
 * Settings on its right), a period header and nav, then the grid or list itself. */
export default function Loading(): ReactElement {
  return (
    <div aria-hidden="true">
      <SkeletonHeading />
      <div className="mt-4">
        <SkeletonLine className="h-10 w-16" />
      </div>
      <div className="mt-8 flex items-center justify-between gap-4 border-b border-line pb-4">
        <SkeletonFilterRow />
        <div className="flex gap-6">
          <SkeletonLine className="h-4 w-20" />
          <SkeletonLine className="h-4 w-16" />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between gap-4 border-b border-line pb-4">
        <SkeletonLine className="h-5 w-40" />
        <SkeletonLine className="h-4 w-40" />
      </div>
      <SkeletonGrid />
    </div>
  );
}
