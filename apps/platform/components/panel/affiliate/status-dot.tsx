import type { ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";

/**
 * A dot and a short word. The dot is only a reinforcement: every state is also written, so nothing depends on colour.
 * Settled or stopped states are an open ring rather than a faint fill, so they still read as a mark.
 */
export type StatusTone = "done" | "waiting" | "quiet";

const DOTS: Readonly<Record<StatusTone, string>> = {
  done: "bg-success",
  waiting: "bg-gold-deep",
  quiet: "ring-[1.5px] ring-inset ring-ink-soft/65",
};

interface StatusDotProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly className?: string;
}

export function StatusDot({ tone, label, className }: StatusDotProps): ReactElement {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-sm tabular-nums text-ink-soft", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOTS[tone])} />
      {label}
    </span>
  );
}
