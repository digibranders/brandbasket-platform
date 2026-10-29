import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/**
 * Lets a list table scroll sideways inside its own box, so a wide table never widens the page on a phone. On desktop the
 * table is full width and the box never scrolls, so the layout does not change. Spacing such as `mt-6` goes on this box,
 * not on the table.
 */
export function TableScroll({
  children,
  label,
  className,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn("overflow-x-auto", className)}>
      {children}
    </div>
  );
}
