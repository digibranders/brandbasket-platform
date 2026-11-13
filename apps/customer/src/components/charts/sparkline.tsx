import { cx } from "@/ui/cx";
import { sparkPoints } from "./scale";

const WIDTH = 72;
const HEIGHT = 24;

export interface SparklineProps {
  readonly values: readonly number[];
  /** Names the trend for screen readers. Leave it out when the row beside it already says the number. */
  readonly label?: string;
  readonly className?: string;
}

/** A 72 by 24 trend line in c1, no axes (plan 60, section 11). Decorative unless it has a label. */
export function Sparkline({ values, label, className }: SparklineProps) {
  if (values.length < 2) return null;
  const naming = label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} className={cx("shrink-0", className)} {...naming}>
      <polyline points={sparkPoints(values, WIDTH, HEIGHT)} fill="none" className="stroke-c1" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
