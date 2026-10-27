"use client";

import { useActionState, type ReactElement } from "react";
import { PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { acceptStaffInviteAction, type StaffAcceptFormState } from "@/app/staff-invite/[token]/actions";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";

const IDLE: StaffAcceptFormState = { status: "idle" };

/** Joins the console: a name and a password for a new account, or one button for the signed-in owner of the address. */
export function StaffInviteForm({ token, mode }: { readonly token: string; readonly mode: "create" | "join" }): ReactElement {
  const [state, action, pending] = useActionState(acceptStaffInviteAction, IDLE);
  const error = state.status === "error" ? state : null;
  const invalid = (field: string): true | undefined => (error?.field === field ? true : undefined);

  return (
    <form action={action} noValidate className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "create" ? (
        <>
          <div>
            <label htmlFor="accept-name" className={labelClasses}>
              Your name
            </label>
            <input id="accept-name" name="name" required maxLength={120} autoComplete="name" aria-invalid={invalid("name")} className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="accept-password" className={labelClasses}>
              Choose a password
            </label>
            <input id="accept-password" name="password" type="password" required autoComplete="new-password" aria-invalid={invalid("password")} aria-describedby="accept-password-hint" className={fieldClasses} />
            <p id="accept-password-hint" className={hintClasses}>
              {PASSWORD_RULE}
            </p>
          </div>
          <div>
            <label htmlFor="accept-confirm" className={labelClasses}>
              Repeat the password
            </label>
            <input id="accept-confirm" name="confirm" type="password" required autoComplete="new-password" aria-invalid={invalid("confirm")} className={fieldClasses} />
          </div>
        </>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="text-sm text-error">
          {error.message}
        </p>
      )}
      <TurnstileWidget action="staff_invite" resetKey={state} />
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? "One moment..." : mode === "create" ? "Set password and join" : "Join the console"}
      </button>
    </form>
  );
}
