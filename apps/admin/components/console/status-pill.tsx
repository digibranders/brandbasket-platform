import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export type PillTone = "wait" | "done" | "progress" | "todo" | "problem";

const TONES: Readonly<Record<PillTone, string>> = {
  wait: "bg-rattan-wash text-rattan-ink",
  done: "bg-sage-wash text-sage-deep",
  progress: "bg-c-search/12 text-c-search",
  todo: "bg-sunken text-ink-2",
  problem: "bg-error/10 text-error",
};

/** A state in words on a soft tint: the word carries the meaning, the colour only helps. */
export function StatusPill({ tone, children }: { readonly tone: PillTone; readonly children: ReactNode }): ReactElement {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold", TONES[tone])}>{children}</span>;
}
