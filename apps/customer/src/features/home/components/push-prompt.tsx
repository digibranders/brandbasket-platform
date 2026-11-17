"use client";

import { usePushDevice } from "@brandbasket/shared/lib/use-push-device";
import { useEffect, useState } from "react";
import { removePushDeviceAction, savePushDeviceAction } from "@/features/settings/push-actions";
import { Banner, Button } from "@/ui";

/** Remembered in this browser: a person who said "Not now" is not asked again on this device. */
export const PUSH_PROMPT_DISMISSED_KEY = "bb.pushPrompt.dismissed";

function wasDismissed(): boolean {
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
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(wasDismissed()), []);

  if (dismissed || state !== "off") return null;

  function dismiss(): void {
    setDismissed(true);
    try {
      window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // The prompt is gone for this visit; it may return on the next.
    }
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
