"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isSearchShortcut } from "../../lib/search-shortcut";

/**
 * Keeps a native `<dialog>` open while `open` is true and closed while it is false. A native dialog gives Escape to
 * close and returns focus where it was, so neither has to be written by hand.
 */
export function useDialogOpen(open: boolean): RefObject<HTMLDialogElement | null> {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return dialog;
}

/** Calls `onShortcut` on Command K or Control K. Pass undefined where another search on the page already listens. */
export function useSearchShortcut(onShortcut: (() => void) | undefined): void {
  useEffect(() => {
    if (onShortcut === undefined) return;
    const listen = (event: KeyboardEvent): void => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      onShortcut();
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [onShortcut]);
}
