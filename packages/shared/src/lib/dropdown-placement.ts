/**
 * Where a dropdown's list goes, kept apart from the component so it can be tested. The list is fixed to the window,
 * so it is placed from the trigger's on-screen box: below it by default, above it when the list would otherwise run
 * past the bottom and there is more room above, and always inside the window with a small margin. Mirrors
 * fynix-website/lib/dropdown-placement.ts.
 */

export const DROPDOWN_LIMITS = {
  /** Kept clear between the list and every edge of the window. */
  edge: 8,
  /** Between the trigger and the list. */
  gap: 6,
  /** 18rem: about seven options before the list scrolls. */
  maxHeight: 288,
  /** 20rem: room for a long label, such as a country's full name, beside a short trigger. */
  maxWidth: 320,
} as const;

export interface DropdownPlacementInput {
  readonly trigger: { readonly top: number; readonly bottom: number; readonly left: number; readonly width: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** The list's natural size, before any cap: its content width and full scroll height. */
  readonly list: { readonly width: number; readonly height: number };
}

export interface DropdownPlacement {
  readonly side: "below" | "above";
  /**
   * Distance from the window's top edge to the list (below), or from the window's bottom edge to the list (above).
   * Anchoring an upward list by its bottom keeps it clear of the trigger even if wrapping labels make it taller.
   */
  readonly offset: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function placeDropdown({ trigger, viewport, list }: DropdownPlacementInput): DropdownPlacement {
  const { edge, gap } = DROPDOWN_LIMITS;
  const roomBelow = viewport.height - trigger.bottom - gap - edge;
  const roomAbove = trigger.top - gap - edge;
  const wanted = Math.min(list.height, DROPDOWN_LIMITS.maxHeight);
  const side = roomBelow >= wanted || roomBelow >= roomAbove ? "below" : "above";

  const maxHeight = Math.max(0, Math.min(DROPDOWN_LIMITS.maxHeight, side === "below" ? roomBelow : roomAbove));
  const offset = side === "below" ? trigger.bottom + gap : viewport.height - trigger.top + gap;

  const room = viewport.width - edge * 2;
  const minWidth = Math.min(trigger.width, room);
  const maxWidth = Math.min(Math.max(trigger.width, DROPDOWN_LIMITS.maxWidth), room);
  const width = clamp(list.width, minWidth, maxWidth);
  const left = clamp(trigger.left, edge, viewport.width - edge - width);

  return { side, offset, left, width, maxHeight };
}
