import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/**
 * A coloured dot and a short label. Done is sage, moving is ink, waiting is the rattan accent, a problem is the error
 * red with a soft ring, and anything settled or not started is an open ring. The label always says the same thing in
 * words.
 */
export type StatusTone = "done" | "moving" | "waiting" | "problem" | "quiet";

const DOTS: Readonly<Record<StatusTone, string>> = {
  done: "bg-sage",
  moving: "bg-ink",
  waiting: "bg-rattan",
  problem: "bg-error ring-4 ring-error/15",
  quiet: "ring-[1.5px] ring-inset ring-ink-2/65",
};

interface StatusDotProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly className?: string;
}

export function StatusDot({ tone, label, className }: StatusDotProps): ReactElement {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-sm tabular-nums", tone === "problem" ? "font-medium text-error" : "text-ink-2", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOTS[tone])} />
      {label}
    </span>
  );
}
