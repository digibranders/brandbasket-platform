"use client";

import { useEffect } from "react";

export const UNSAVED_CHANGES_PROMPT = "You have unsaved changes. If you leave this page they will be lost.";

/** A plain left click on a link to another page of this app, which Next would follow without a page load. */
export function isInternalNavigation(event: MouseEvent, origin: string): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!(event.target instanceof Element)) return false;
  const link = event.target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return false;
  if ((link.target !== "" && link.target !== "_self") || link.hasAttribute("download")) return false;
  const to = new URL(link.href, origin);
  const here = new URL(origin);
  if (to.origin !== here.origin) return false;
  return to.pathname !== window.location.pathname || to.search !== window.location.search;
}

/**
 * Warns before a form with unsaved changes is left. Closing or reloading the tab uses the browser's own prompt; a click on
 * a link to another page of the app asks first, because Next changes page without a reload. The browser's Back button
 * is not caught.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault();
    const onClick = (event: MouseEvent): void => {
      if (!isInternalNavigation(event, window.location.href)) return;
      if (window.confirm(UNSAVED_CHANGES_PROMPT)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
