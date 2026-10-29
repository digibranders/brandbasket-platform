"use client";

import { useActionState, type ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { initialRevokeOtherSessionsState, type RevokeOtherSessionsState } from "@/lib/account-settings-form";

interface SignOutOtherDevicesProps {
  readonly action: (state: RevokeOtherSessionsState) => Promise<RevokeOtherSessionsState>;
}

/** Signs this account out everywhere except the device in use, without changing the password. */
export function SignOutOtherDevices({ action }: SignOutOtherDevicesProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialRevokeOtherSessionsState);
  return (
    <form action={formAction} aria-busy={isPending} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-xl text-[0.9375rem] leading-relaxed text-ink-2">Lost a phone, or used a shared computer? Sign out every other device. You stay signed in here.</p>
        <button type="submit" disabled={isPending} className={`${SOFT_BUTTON} disabled:opacity-55`}>
          {isPending ? "Signing out…" : "Sign out other devices"}
        </button>
      </div>
      {state.status === "revoked" && !isPending ? (
        <p role="status" className="text-[0.9375rem] font-semibold text-ok">
          Your other devices are signed out.
        </p>
      ) : null}
      {state.status === "error" && !isPending ? (
        <p role="alert" className="text-[0.9375rem] font-semibold text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
