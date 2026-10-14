import type { ReactElement } from "react";
import { cn } from "../../lib/cn";

/**
 * The shape of a screen while its data is still being read.
 *
 * Every dashboard route was a blocking server render with no `loading.tsx` behind it, so following a nav link left
 * the last screen frozen with nothing to say the click had registered. These stand in for the real thing at roughly
 * its size, which is the point: the page should not jump when the content lands.
 *
 * Whitespace and hairlines only, no bordered boxes: a loading screen drawn as a grid of empty cards read as a page of
 * containers waiting for something, which is the look the dashboard itself has moved away from (apps/platform
 * DESIGN.md, "Principles").
 *
 * `motion-safe` only — a pulsing block is exactly what someone who asked for reduced motion asked not to see.
 */

/**
 * One pulsing bar. Exported so a route whose page has its own shape (a list, a form, a calendar) can draw that
 * shape from the same bar instead of keeping a private copy of it.
 */
export function SkeletonLine({ className }: { readonly className?: string }): ReactElement {
  return <span className={cn("block rounded-full bg-ink/[0.07] motion-safe:animate-pulse", className)} />;
}

/** The page title and its one-line lede. */
export function SkeletonHeading(): ReactElement {
  return (
    <div>
      <SkeletonLine className="h-7 w-56" />
      <SkeletonLine className="mt-3 h-4 w-72 max-w-full" />
    </div>
  );
}

/** A row of figures: a short label, the figure, one line under it, each sitting on a hairline. */
export function SkeletonStatRow(): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="border-t border-line pt-4">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="mt-3 h-6 w-16" />
          <SkeletonLine className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A section under a hairline: its heading, then `lines` rows of body text. */
export function SkeletonSection({ lines = 3 }: { readonly lines?: number }): ReactElement {
  return (
    <div className="border-t border-line pt-6">
      <SkeletonLine className="h-4 w-32" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

interface SkeletonPageProps {
  readonly stats?: boolean;
  /** How many sections follow the heading (and the figures, when there are some). */
  readonly sections?: number;
}

/** The default shape: a heading, optionally a row of figures, then some hairline-separated sections. */
export function SkeletonPage({ stats = false, sections = 2 }: SkeletonPageProps): ReactElement {
  return (
    <div aria-hidden="true">
      <SkeletonHeading />
      {stats ? (
        <div className="mt-8">
          <SkeletonStatRow />
        </div>
      ) : null}
      <div className={cn("grid gap-x-10 gap-y-10", sections > 1 && "xl:grid-cols-2", stats ? "mt-10" : "mt-8")}>
        {Array.from({ length: sections }, (_, i) => (
          <SkeletonSection key={i} />
        ))}
      </div>
    </div>
  );
}
