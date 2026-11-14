import type { ReactElement } from "react";

export interface StatTileProps {
  readonly label: string;
  readonly value: string | number;
  readonly delta?: string;
  readonly deltaTone?: "positive" | "neutral";
  readonly className?: string;
}

/**
 * StatTile: Mono numbers 32px, label above in 13px, optional delta in sage or muted.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  className = "",
}: StatTileProps): ReactElement {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="font-sans text-[13px] font-medium leading-5 text-ink-2">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[32px] font-medium leading-9 tracking-tight text-ink tabular-nums">
          {value}
        </span>
        {delta !== undefined ? (
          <span
            className={`font-sans text-xs font-semibold ${
              deltaTone === "positive" ? "text-pos-text" : "text-ink-muted"
            }`}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
