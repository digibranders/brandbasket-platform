"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Overlay layers (menu, dialog, command bar, side panel). They share one stack so Esc closes only the top layer, one per
 * press, and focus goes back to whatever opened the layer. A layer with `trap` also keeps Tab inside its container.
 */
const stack: symbol[] = [];

/** True while any layer from this module is open. DataTable uses it so Esc clears a selection only when nothing is open. */
export function hasOpenLayer(): boolean {
  return stack.length > 0;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
}

export interface LayerOptions {
  readonly open: boolean;
  /** Called on Esc when this layer is the top one. */
  readonly onEscape: () => void;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly trap?: boolean;
  /** Where focus goes on close. Default is the element that had focus when the layer opened. */
  readonly returnFocusTo?: RefObject<HTMLElement | null>;
  /** Set true just before closing when the user clicked elsewhere, so focus is not pulled back from the thing they chose. */
  readonly skipRestore?: RefObject<boolean>;
}

export function useLayer({ open, onEscape, containerRef, trap = true, returnFocusTo, skipRestore }: LayerOptions): void {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  const returnTo = useRef(returnFocusTo);
  returnTo.current = returnFocusTo;

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol("layer");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(id);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        escape.current();
        return;
      }
      if (event.key === "Tab" && trap && containerRef.current) {
        const items = focusableWithin(containerRef.current);
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0] as HTMLElement;
        const last = items[items.length - 1] as HTMLElement;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !containerRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !containerRef.current.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      if (skipRestore?.current) {
        skipRestore.current = false;
        return;
      }
      const target = returnTo.current?.current ?? opener;
      if (target?.isConnected) target.focus();
    };
  }, [open, trap, containerRef, skipRestore]);
}
