import type { ReactElement, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * The dashboard's surfaces, so that a screen has a shape instead of a stack of identical boxes.
 *
 * Every section used to be the same bordered card, which left nothing for the eye to rank: a status that needed
 * attention looked exactly like a list of old receipts. Three tones fix that — `raised` is the thing you came for,
 * `quiet` is supporting material that should recede, and `flat` is a grouping that needs no box at all, only a rule.
 */
export type SurfaceTone = "raised" | "quiet" | "flat";

const TONES: Readonly<Record<SurfaceTone, string>> = {
  raised: "rounded-card border border-line bg-card p-6 sm:p-7",
  quiet: "rounded-card bg-paper-deep/50 p-6 sm:p-7",
  flat: "border-t border-line pt-6",
};

interface SurfaceProps {
  readonly tone?: SurfaceTone;
  readonly className?: string;
  readonly children: ReactNode;
  /** Renders as `<section>` with this heading id wired to `aria-labelledby`. Without it, a plain `<div>`. */
  readonly labelledBy?: string;
}

export function Surface({ tone = "raised", className, children, labelledBy }: SurfaceProps): ReactElement {
  const classes = cn(TONES[tone], className);
  if (labelledBy === undefined) return <div className={classes}>{children}</div>;
  return (
    <section aria-labelledby={labelledBy} className={classes}>
      {children}
    </section>
  );
}

interface SectionHeadingProps {
  readonly id?: string;
  readonly children: ReactNode;
  /** A short line under the heading. One sentence — anything longer belongs in the body. */
  readonly hint?: ReactNode;
  /** A control sitting opposite the heading, such as "New post". */
  readonly action?: ReactNode;
}

/** A heading row inside a surface, with optional hint and a control pinned to the far end. */
export function SectionHeading({ id, children, hint, action }: SectionHeadingProps): ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 id={id} className="panel-section">
          {children}
        </h2>
        {hint === undefined ? null : <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
