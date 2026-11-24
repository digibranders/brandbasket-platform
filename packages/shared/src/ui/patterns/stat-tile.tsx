import type { ReactElement } from "react";

export type StatTileTone = "positive" | "neutral" | "warning" | "negative";

export interface StatTileProps {
  readonly label: string;
  readonly value: string | number;
  /** A short change beside the figure. */
  readonly delta?: string;
  /** A short qualifier under the figure. */
  readonly note?: string;
  /** Sage for good news, gold for something to watch, red only for late or failed. */
  readonly deltaTone?: StatTileTone;
  /** "medium" sets a long figure, such as rupees with paise, at 22px so it stays on one line. */
  readonly size?: "large" | "medium";
  readonly className?: string;
}

const TONES: Readonly<Record<StatTileTone, string>> = {
  positive: "text-pos-text",
  neutral: "text-ink-muted",
  warning: "text-accent-text",
  negative: "text-neg-text",
};

/**
 * StatTile: Mono numbers 32px, label above in 13px, optional delta beside the figure and note under it.
 */
export function StatTile({
  label,
  value,
  delta,
  note,
  deltaTone = "neutral",
  size = "large",
  className = "",
}: StatTileProps): ReactElement {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="font-sans text-[13px] font-medium leading-5 text-ink-2">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono font-medium tracking-tight text-ink tabular-nums ${
            size === "medium" ? "text-[22px] leading-7" : "text-[32px] leading-9"
          }`}
        >
          {value}
        </span>
        {delta !== undefined ? (
          <span className={`font-sans text-xs font-semibold ${TONES[deltaTone]}`}>{delta}</span>
        ) : null}
      </div>
      {note !== undefined ? <span className={`font-sans text-xs font-medium ${TONES[deltaTone]}`}>{note}</span> : null}
    </div>
  );
}
