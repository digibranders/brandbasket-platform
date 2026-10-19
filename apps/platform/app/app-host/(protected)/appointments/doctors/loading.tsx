import type { ReactElement } from "react";
import { SkeletonHeading, SkeletonLine } from "@brandbasket/shared/ui/panel/skeleton";

/** One doctor's row: the round avatar, then a name and a shorter line under it. */
function SkeletonDoctor(): ReactElement {
  return (
    <div className="flex items-center gap-3 py-4">
      <SkeletonLine className="size-10 shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="h-3 w-40" />
        <SkeletonLine className="h-3 w-28" />
      </div>
    </div>
  );
}

/** Mirrors the real page's shape: a back link, a heading, a few doctor rows between hairlines, then the add form. */
export default function Loading(): ReactElement {
  return (
    <div aria-hidden="true">
      <SkeletonLine className="h-3 w-36" />
      <div className="mt-3">
        <SkeletonHeading />
      </div>
      <div className="mt-8 divide-y divide-line border-y border-line">
        <SkeletonDoctor />
        <SkeletonDoctor />
      </div>
      <div className="mt-10 space-y-3">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-10 w-full" />
      </div>
    </div>
  );
}
