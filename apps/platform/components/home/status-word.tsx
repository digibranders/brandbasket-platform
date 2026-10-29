import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export type StatusTone = "neutral" | "ok" | "warn" | "info" | "brand";

const TONE: Readonly<Record<StatusTone, string>> = {
  neutral: "bg-sunken text-ink-2",
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  info: "bg-info-wash text-info",
  brand: "bg-rattan-wash text-rattan-ink",
};

/** A state as a word with a colour behind it: the colour never stands alone (DESIGN.md "Palette"). */
export function StatusWord({ tone, children, className }: { readonly tone: StatusTone; readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <span className={cn("inline-flex h-[1.625rem] items-center gap-1.5 self-start rounded-full px-3 text-[0.8125rem] font-semibold", TONE[tone], className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
