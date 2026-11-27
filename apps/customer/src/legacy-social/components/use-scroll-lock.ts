"use client";

import { useEffect } from "react";

/** How many open pop-ups hold the page still; the page scrolls again only when the last one closes. */
let holders = 0;
let before = "";

/**
 * Keeps the page behind an open pop-up from scrolling: the wheel and touch scroll the pop-up's own content and nothing behind it. A native
 * modal dialog blocks clicks behind it but not scrolling, so the page moved under the customer's hand. Several pop-ups at once share one lock.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    if (holders === 0) {
      before = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders === 0) document.body.style.overflow = before;
    };
  }, [active]);
}
