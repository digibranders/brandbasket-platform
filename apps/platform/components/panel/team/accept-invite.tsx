"use client";

import { useActionState, type ReactElement } from "react";
import { DARK_BUTTON } from "@/components/v2/classes";
import { initialAcceptInviteState, type AcceptInviteState } from "@/lib/team/rules";

interface AcceptInviteProps {
  /** The accept action with the invitation's token already bound. */
  readonly action: (state: AcceptInviteState, formData: FormData) => Promise<AcceptInviteState>;
}

/**
 * The button that uses the invitation. Opening the link changes nothing: the invitation is used only when this is pressed,
 * so a link scanner or a preview cannot use it up. A refusal is written under it; success leaves for Home.
 */
export function AcceptInvite({ action }: AcceptInviteProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialAcceptInviteState);
  return (
    <form action={formAction} aria-busy={isPending} className="grid gap-3">
      <button type="submit" disabled={isPending} className={`${DARK_BUTTON} w-full`}>
        {isPending ? "Joining…" : "Join the team"}
      </button>
      {state.status === "error" && !isPending ? (
        <p role="alert" className="text-[0.9375rem] font-semibold text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
