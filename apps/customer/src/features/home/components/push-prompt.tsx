"use client";

import { usePushDevice } from "@brandbasket/shared/lib/use-push-device";
import { useSyncExternalStore } from "react";
import { removePushDeviceAction, savePushDeviceAction } from "@/features/settings/push-actions";
import { Banner, Button } from "@/ui";

/** Remembered in this browser: a person who said "Not now" is not asked again on this device. */
export const PUSH_PROMPT_DISMISSED_KEY = "bb.pushPrompt.dismissed";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Set when storage is blocked, so "Not now" still hides the prompt for the rest of this visit. */
let dismissedThisVisit = false;

function wasDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    // Storage blocked: ask again next visit rather than never.
    return false;
  }
}

/**
 * One prompt on Home once the plan is paid. It shows only where push can work and is still off, and never after "Not now". The
 * browser's own permission question appears only after the person presses the button.
 */
export function PushPrompt({ publicKey }: { readonly publicKey: string | null }) {
  const { state, busy, message, turnOn } = usePushDevice({ publicKey, save: savePushDeviceAction, remove: removePushDeviceAction });
  // Hidden on the server and until the browser has been read, so a dismissed prompt never flashes.
  const dismissed = useSyncExternalStore(subscribe, wasDismissed, () => true);

  if (dismissed || state !== "off") return null;

  function dismiss(): void {
    dismissedThisVisit = true;
    try {
      window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // Not remembered: the prompt may return on the next visit.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <Banner
      className="mb-6"
      action={
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={dismiss} disabled={busy}>
            Not now
          </Button>
          <Button variant="primary" onClick={() => void turnOn()} disabled={busy}>
            Turn on notices
          </Button>
        </div>
      }
    >
      Get a notice on this device when something needs you.
      {message === null ? null : <span className="mt-1 block text-neg-text">{message}</span>}
    </Banner>
  );
}
