import type { ReactElement } from "react";
import { SkeletonHeading, SkeletonLine } from "@brandbasket/shared/ui/panel/skeleton";

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

/** Mirrors the real page's shape: a heading, then three sections separated by hairlines rather than a grid of
 * cards — this page has no card-shaped content for SkeletonPage's default to stand in for. */
export default function Loading(): ReactElement {
  return (
    <div aria-hidden="true">
      <SkeletonHeading />
      <div className="mt-8">
        <SkeletonSection />
      </div>
      <div className="mt-10 space-y-8 border-t border-line pt-8">
        <SkeletonSection />
      </div>
      <div className="mt-10 space-y-8 border-t border-line pt-8">
        <SkeletonSection />
      </div>
    </div>
  );
}
