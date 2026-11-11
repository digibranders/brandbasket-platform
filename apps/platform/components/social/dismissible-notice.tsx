"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";

/** Where the dismissed notice is remembered, in this browser only. */
const STORAGE_KEY = "bb.social.dismissed-notice";

const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** What was dismissed, or null when nothing was or the browser keeps nothing. */
function dismissedId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface DismissibleNoticeProps {
  /** What the notice is about now. A new thing to say gets a new id, so a dismissed notice comes back when there is something new. */
  readonly id: string;
  readonly children: ReactNode;
}

/**
 * A warm notice with a cross to close it. Closing is remembered in this browser for what it said, not for good: when there is something
 * new to say the notice comes back. If the browser keeps nothing, the notice shows each time. The server always draws it, so the page
 * and the browser agree on first paint.
 */
export function DismissibleNotice({ id, children }: DismissibleNoticeProps): ReactElement | null {
  const dismissed = useSyncExternalStore(subscribe, dismissedId, () => null);
  if (dismissed === id) return null;
  const close = (): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Nothing to keep it in: it stays until the page is opened again.
    }
    for (const notify of listeners) notify();
  };
  return (
    <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
      <div className="min-w-0">{children}</div>
      <button type="button" aria-label="Dismiss this notice" onClick={close} className="-mr-1 grid size-6 shrink-0 place-items-center rounded-full hover:bg-surface/60">
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
