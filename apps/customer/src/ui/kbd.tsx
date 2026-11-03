import type { ReactNode } from "react";
import { cx } from "./cx";

/** A keyboard shortcut hint, such as ⌘K: the one text allowed below 12px. */
export function Kbd({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <kbd className={cx("rounded-mark border border-border bg-neutral-wash px-1 font-sans type-kbd text-ink-3", className)}>{children}</kbd>;
}
