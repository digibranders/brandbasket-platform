"use client";

import { Meter as BaseMeter } from "@base-ui/react/meter";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface MeterProps {
  readonly label: ReactNode;
  readonly value: number;
  readonly max: number;
  /** Both numbers, already written for reading ("9 of 12"). Shown above the bar and read by screen readers. */
  readonly valueText: string;
  readonly tone?: "accent" | "pos";
  readonly className?: string;
}

/** A 6px bar with its label and both numbers above it: never colour alone (plan 60, Meter). */
export function Meter({ label, value, max, valueText, tone = "accent", className }: MeterProps) {
  return (
    <BaseMeter.Root value={value} max={max} getAriaValueText={() => valueText} className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <BaseMeter.Label className="type-body text-ink">{label}</BaseMeter.Label>
        <span className="type-meta">{valueText}</span>
      </div>
      <BaseMeter.Track className="h-1.5 overflow-hidden rounded-full bg-neutral-wash">
        <BaseMeter.Indicator className={cx("h-full", tone === "pos" ? "bg-pos-text" : "bg-c1")} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
