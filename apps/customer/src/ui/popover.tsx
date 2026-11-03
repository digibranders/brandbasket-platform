"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";

export interface PopoverProps {
  readonly trigger: ReactElement<Record<string, unknown>>;
  /** Names the popover for screen readers; shown as its heading. */
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly align?: "start" | "center" | "end";
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
}

/** Extra content anchored to a button, such as the notifications list. Escape closes and focus returns. */
export function Popover({ trigger, title, children, align = "center", open, onOpenChange, className }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} align={align} className="z-50">
          <BasePopover.Popup className={cx("motion-menu w-80 max-w-(--available-width) rounded-panel border border-border bg-surface shadow-pop outline-none", className)}>
            <BasePopover.Title className="border-b border-border-subtle px-3 py-2.5 type-section">{title}</BasePopover.Title>
            <div className="p-1">{children}</div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
