"use client";

import { useActionState, type ReactElement } from "react";
import { ArrowIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { initialUpgradeFormState, type UpgradeFormState } from "@/lib/upgrade-view";

interface UpgradePayFormProps {
  readonly action: () => Promise<UpgradeFormState>;
  /** What the provider will take today, tax included: the figure on the button is the figure charged. Null when there is nothing to take. */
  readonly amount: string | null;
}

/**
 * The Upgrade page's one button. Disabled while the payment is being opened, so a double press opens one payment. A
 * refusal is shown under it and announced again each time, because the alert unmounts while the action runs.
 */
export function UpgradePayForm({ action, amount }: UpgradePayFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialUpgradeFormState);
  const message = state.status === "error" && !isPending ? state.message : null;

  return (
    <form action={formAction}>
      <Button type="submit" disabled={isPending} aria-busy={isPending} aria-describedby={message === null ? undefined : "upgrade-error"} className="group">
        {isPending ? (amount === null ? "Moving you up…" : "Opening payment…") : amount === null ? "Move up to Premium" : `Pay ${amount} and move up`}
        <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
      </Button>
      {message === null ? null : (
        <p id="upgrade-error" role="alert" className="mt-4 max-w-xl rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {message}
        </p>
      )}
    </form>
  );
}
