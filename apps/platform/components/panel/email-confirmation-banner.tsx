"use client";

import { useActionState, type ReactElement } from "react";
import type { ResendConfirmationState } from "@/app/app-host/(protected)/email-confirmation-actions";

interface EmailConfirmationBannerProps {
  readonly email: string;
  readonly resend: () => Promise<ResendConfirmationState>;
}

const IDLE: ResendConfirmationState = { status: "idle" };

/**
 * Asks a free listing account to confirm its email address: until it does, we don't confirm its business. Shown on
 * every page of the account until the link in the email has been opened.
 */
export function EmailConfirmationBanner({ email, resend }: EmailConfirmationBannerProps): ReactElement {
  const [state, action, isPending] = useActionState(resend, IDLE);
  return (
    <div role="status" className="mb-8 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
      <p>
        <span className="font-semibold">Confirm your email.</span> We sent a link to {email}. Open it so we can confirm your
        business.
      </p>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="submit" disabled={isPending} className="link-underline font-semibold disabled:opacity-60">
          {isPending ? "Sending…" : "Send the link again"}
        </button>
        {state.status === "done" && !isPending ? <span>{state.message}</span> : null}
      </form>
    </div>
  );
}
