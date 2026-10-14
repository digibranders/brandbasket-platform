import type { ReactElement, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * One figure about the customer's own business.
 *
 * The customer dashboard had no numbers in it at all — every answer was a paragraph, which is why it read as
 * something to be looked at rather than used. A tile carries a label, the figure itself, and at most one line
 * saying what it means; anything that needs more than that is not a statistic.
 *
 * The label is sentence case at 13px: it names the figure, so it is information and is read, not scanned past as a
 * tiny uppercase eyebrow. The figure is `tabular-nums` so amounts and counts line up across the row.
 */
export type StatTone = "neutral" | "good" | "attention";

const TONES: Readonly<Record<StatTone, string>> = {
  neutral: "text-ink",
  good: "text-ink",
  attention: "text-accent-deep",
};

const DOTS: Readonly<Record<StatTone, string>> = {
  // Full strength: a status mark needs 3:1 against the tile, and ink-soft at 35% was 1.9:1.
  neutral: "bg-ink-soft",
  good: "bg-emerald-600",
  attention: "bg-accent",
};

interface StatTileProps {
  readonly label: string;
  /** The figure. A short string or a small element — never a sentence. */
  readonly value: ReactNode;
  /** One line under the figure: what it means, or when it happens. */
  readonly hint?: ReactNode;
  readonly tone?: StatTone;
  /** Shows a status dot beside the label. For tiles whose figure is a state rather than a number. */
  readonly showDot?: boolean;
}

export function StatTile({ label, value, hint, tone = "neutral", showDot = false }: StatTileProps): ReactElement {
  return (
    <div className="rounded-card border border-line bg-card px-5 py-4">
      <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink-soft">
        {showDot ? <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} /> : null}
        {label}
      </p>
      <p className={cn("mt-2 font-serif text-2xl leading-none tabular-nums", TONES[tone])}>{value}</p>
      {hint === undefined ? null : <p className="mt-2 text-xs leading-relaxed tabular-nums text-ink-soft">{hint}</p>}
    </div>
  );
}

/** The row those tiles sit in. Two up on phones, four across once there is room. */
export function StatRow({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>;
}
