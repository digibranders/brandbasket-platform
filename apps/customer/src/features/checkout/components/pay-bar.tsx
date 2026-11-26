"use client";

import { Button } from "@/ui";
import { cx } from "@/ui/cx";

/*
 * The Pay button, and the bar that keeps it and the total in reach on phones and tablets while the form scrolls. Both submit
 * the screen's one form, so a press anywhere runs the same two posts.
 */

interface PayButtonProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly size?: "md" | "lg";
  readonly className?: string;
}

export function PayButton({ label, disabled, pending, size = "lg", className }: PayButtonProps) {
  return (
    <Button type="submit" variant="primary" size={size} disabled={disabled} pending={pending} className={className}>
      {label}
    </Button>
  );
}

interface PayBarProps {
  readonly due: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
}

/** Fixed to the bottom of the screen below the large breakpoint. The page keeps a spacer of the same height (PayBarSpacer). */
export function PayBar({ due, label, disabled, pending }: PayBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex h-save-bar items-center justify-between gap-3 border-t border-border bg-surface px-4 md:px-8 lg:hidden">
      <div className="flex min-w-0 flex-col">
        <span className="type-meta">Due today</span>
        <span className="font-mono font-bold tabular-nums text-ink">{due}</span>
      </div>
      <PayButton label={label} disabled={disabled} pending={pending} size="md" className="px-5" />
    </div>
  );
}

/** Keeps the last of the page clear of the fixed bar. */
export function PayBarSpacer({ className }: { readonly className?: string }) {
  return <div aria-hidden="true" className={cx("h-save-bar lg:hidden", className)} />;
}
