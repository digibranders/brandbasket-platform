"use client";

import { useEffect, useState, type RefObject } from "react";
import { formSnapshot } from "@/lib/details/form-snapshot";

/**
 * Whether the form the button belongs to now holds something other than what it started with. The start is read when the
 * form mounts and again whenever `startKey` changes (the saved values the page drew it from), so a save that goes through
 * makes the form unchanged again. A check runs on each input, change, click and reset, and a tick later for what React
 * writes after the event (the same reasons as useFormComplete in packages/shared).
 */
export function useFormChanged(control: RefObject<HTMLButtonElement | null>, startKey: string): boolean {
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const form = control.current?.form;
    if (form === null || form === undefined) return undefined;
    const start = formSnapshot(new FormData(form));
    let timer: number | undefined;
    const check = (): void => setChanged(formSnapshot(new FormData(form)) !== start);
    const later = (): void => {
      check();
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 0);
    };
    for (const type of ["input", "change", "click", "reset"]) form.addEventListener(type, later);
    // A new start (a save went through) makes the form unchanged again.
    timer = window.setTimeout(check, 0);
    return () => {
      window.clearTimeout(timer);
      for (const type of ["input", "change", "click", "reset"]) form.removeEventListener(type, later);
    };
  }, [control, startKey]);
  return changed;
}
