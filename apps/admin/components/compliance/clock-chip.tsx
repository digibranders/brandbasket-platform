import type { ReactElement } from "react";
import { StatusChip, type StatusChipVariant } from "@brandbasket/shared/ui/patterns";
import type { ClockTone } from "@/lib/deadline-clock";

/** The one place a clock's colour is chosen. Red from 72 hours out (the plan's rule); change "soon" to "idle" to keep red for late only. */
const CLOCK_VARIANT: Readonly<Record<ClockTone, StatusChipVariant>> = { late: "failed", soon: "failed", ok: "idle" };

/** A clock in Mono. Every chip carries its words ("overdue", "left"), so colour is never the only sign. */
export function ClockChip({ text, tone, className }: { readonly text: string; readonly tone: ClockTone; readonly className?: string }): ReactElement {
  return <StatusChip label={text} variant={CLOCK_VARIANT[tone]} className={`font-figure tabular-nums ${className ?? ""}`} />;
}
