import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/**
 * A coloured dot and a short label. Five meanings, no traffic lights: done is a calm green, moving is burgundy,
 * waiting is gold, and anything settled or not started stays quiet: an open ring rather than a faint fill, so it
 * still reads (3.5:1) as a mark. Every dot is at least 3:1 on paper; the label says the same thing in words.
 */
export type StatusTone = "done" | "moving" | "waiting" | "problem" | "quiet";

const DOTS: Readonly<Record<StatusTone, string>> = {
  done: "bg-[#3d7a4a]",
  moving: "bg-accent",
  waiting: "bg-gold-deep",
  problem: "bg-accent ring-4 ring-accent/15",
  quiet: "ring-[1.5px] ring-inset ring-ink-soft/65",
};

interface StatusDotProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly className?: string;
}

export function StatusDot({ tone, label, className }: StatusDotProps): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-sm tabular-nums",
        tone === "problem" ? "font-medium text-accent" : "text-ink-soft",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOTS[tone])} />
      {label}
    </span>
  );
}
