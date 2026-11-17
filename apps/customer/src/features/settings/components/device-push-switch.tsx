"use client";

import { PUSH_MESSAGES, usePushDevice } from "@brandbasket/shared/lib/use-push-device";
import { Banner, Switch } from "@/ui";
import { removePushDeviceAction, savePushDeviceAction } from "../push-actions";

const IPHONE_NOTE = "On iPhone this needs Brandbasket added to your Home Screen.";

const STATE_NOTE = {
  blocked: PUSH_MESSAGES.blocked,
  unsupported: PUSH_MESSAGES.unsupported,
  "needs-install": PUSH_MESSAGES.needsInstall,
} as const;

/**
 * Settings, Notifications: the switch for push on this device, above the table. Turning it on is what asks the browser's
 * permission, so nothing is asked on page load. The table's Push column still decides which notices come as a push.
 */
export function DevicePushSwitch({ publicKey }: { readonly publicKey: string | null }) {
  const { state, busy, message, turnOn, turnOff } = usePushDevice({ publicKey, save: savePushDeviceAction, remove: removePushDeviceAction });
  if (state === "unavailable") return null;
  const refused = state === "blocked" || state === "unsupported" || state === "needs-install";
  return (
    <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:px-7">
      <Switch
        label="Notices on this device"
        checked={state === "on"}
        disabled={busy || state === "checking" || refused}
        onCheckedChange={(next) => void (next ? turnOn() : turnOff())}
      />
      <p className="type-small text-ink-3">{refused ? STATE_NOTE[state] : IPHONE_NOTE}</p>
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
    </div>
  );
}
