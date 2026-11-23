"use client";

import { PUSH_MESSAGES, usePushDevice } from "@brandbasket/shared/lib/use-push-device";
import { removePushDeviceAction, savePushDeviceAction } from "@/app/(protected)/settings/push-actions";
import { hintClasses } from "./field-styles";
import { Notice } from "./notice";

const STATE_NOTE = { blocked: PUSH_MESSAGES.blocked, unsupported: PUSH_MESSAGES.unsupported, "needs-install": PUSH_MESSAGES.needsInstall } as const;

/** Settings: the one switch for push on this browser. Turning it on is what asks the browser's permission. */
export function DevicePushSwitch({ publicKey }: { readonly publicKey: string | null }) {
  const { state, busy, message, turnOn, turnOff } = usePushDevice({ publicKey, save: savePushDeviceAction, remove: removePushDeviceAction });
  if (state === "unavailable") return <p className={hintClasses}>Push is not set up on this server.</p>;
  const refused = state === "blocked" || state === "unsupported" || state === "needs-install";
  return (
    <div className="max-w-2xl">
      <label className="inline-flex items-center gap-3 text-sm font-medium text-ink">
        <input
          type="checkbox"
          role="switch"
          className="size-4"
          checked={state === "on"}
          disabled={busy || state === "checking" || refused}
          onChange={(event) => void (event.target.checked ? turnOn() : turnOff())}
        />
        Notices on this browser
      </label>
      <p className={hintClasses}>{refused ? STATE_NOTE[state] : "You get a notice here for calls, new requests and anything staff need to look at."}</p>
      {message === null ? null : <Notice tone="problem" className="mt-3">{message}</Notice>}
    </div>
  );
}
