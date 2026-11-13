import { formatChange, formatNumber } from "@/lib/format";
import { cx } from "@/ui/cx";

export type DeltaTone = "pos" | "neg" | "neutral";

export interface DeltaProps {
  /** The change against the previous period. For `rank`, the positions moved up (8 to 5 is 3, 5 to 8 is -3). */
  readonly value: number;
  readonly unit?: "count" | "percent" | "rank";
  /** Which way is good. Ranks are always better going up. */
  readonly better?: "up" | "down";
  /** The feature's rule says the change is real, not noise. Without it the change is neutral grey. */
  readonly significant?: boolean;
}

/** Green or red only when the change is real and its direction is known to be good or bad (plan 60, section 12). */
export function deltaTone({ value, unit = "count", better = "up", significant = false }: DeltaProps): DeltaTone {
  if (!significant || value === 0) return "neutral";
  const good = unit === "rank" || better === "up" ? value > 0 : value < 0;
  return good ? "pos" : "neg";
}

/** `+9`, `+12%`, `↑3`. */
export function deltaText({ value, unit = "count" }: Pick<DeltaProps, "value" | "unit">): string {
  if (unit === "rank") return value === 0 ? "0" : `${value > 0 ? "↑" : "↓"}${formatNumber(Math.abs(value))}`;
  return formatChange(value, unit);
}

const TONES: Readonly<Record<DeltaTone, string>> = { pos: "text-pos-text", neg: "text-neg-text", neutral: "text-ink-3" };

export function Delta(props: DeltaProps) {
  return <span className={cx("type-label whitespace-nowrap", TONES[deltaTone(props)])}>{deltaText(props)}</span>;
}
