"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export interface TooltipProps {
  /** What the tooltip says: the name of an icon button, or the full text of a truncated one. */
  readonly content: ReactNode;
  /** The element that shows the tooltip on hover and focus. It must be focusable. */
  readonly children: ReactElement<Record<string, unknown>>;
  readonly side?: "top" | "bottom" | "left" | "right";
}

/** For names of icon buttons and truncated text only (plan 60, section 10). */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
          <BaseTooltip.Popup className="motion-menu max-w-64 rounded-badge bg-toast px-2 py-1 type-label text-on-primary shadow-pop">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
