import type { ReactElement } from "react";
import { SkeletonHeading, SkeletonLine } from "@firstfold/shared/ui/panel/skeleton";

/** One section's worth of stand-in content: a label, then a couple of field-sized rows. */
function SkeletonSection(): ReactElement {
  return (
    <div className="space-y-3">
      <SkeletonLine className="h-3 w-24" />
      <SkeletonLine className="h-10 w-full" />
      <SkeletonLine className="h-10 w-2/3" />
    </div>
  );
}

/** Mirrors the real page's shape: a back link, a heading, then two sections separated by a hairline. */
export default function Loading(): ReactElement {
  return (
    <div aria-hidden="true">
      <SkeletonLine className="h-3 w-24" />
      <div className="mt-3">
        <SkeletonHeading />
      </div>
      <div className="mt-8">
        <SkeletonSection />
      </div>
      <div className="mt-10 space-y-3 border-t border-line pt-8">
        <SkeletonSection />
      </div>
      <div className="mt-10 space-y-3 border-t border-line pt-8">
        <SkeletonSection />
      </div>
    </div>
  );
}
