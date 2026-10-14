"use client";

import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

/**
 * The scrolling row behind FilterPills. On a phone the row is wider than the screen, so when the page opens on a pill
 * that sits beyond the right edge it is slid into view rather than left hidden.
 */
export function FilterPillsRow({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  const row = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = row.current;
    const current = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (element === null || element === undefined || current === null || current === undefined) return;
    const overflowsRight = current.offsetLeft + current.offsetWidth > element.scrollLeft + element.clientWidth;
    if (overflowsRight) element.scrollLeft = current.offsetLeft + current.offsetWidth - element.clientWidth + 4;
  }, []);

  return (
    <nav ref={row} aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {children}
    </nav>
  );
}
