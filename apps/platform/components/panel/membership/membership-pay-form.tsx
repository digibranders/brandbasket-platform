"use client";

import { useActionState, type ReactElement } from "react";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { initialMembershipFormState, type MembershipFormState, type MembershipTier } from "@/lib/membership";

interface MembershipPayFormProps {
  readonly action: (state: MembershipFormState, formData: FormData) => Promise<MembershipFormState>;
  /** What the provider will take, tax included: the figure on the button is the figure charged. */
  readonly amount: string;
  /** The plan whose page this is, sent with the press: the server checks it and opens that plan's checkout. */
  readonly tier: MembershipTier;
  /** The add-ons ticked on the page, paid in this same payment. */
  readonly addOns?: readonly MonthlyAddOnId[];
}

/**
 * A plan's one button. Disabled while the payment is being opened, so a double press opens one checkout. A
 * refusal is shown under it and announced again each time, because the alert unmounts while the action runs.
 */
export function MembershipPayForm({ action, amount, tier, addOns = [] }: MembershipPayFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialMembershipFormState);
  const message = state.status === "error" && !isPending ? state.message : null;

  return (
    <form action={formAction}>
      <input type="hidden" name="tier" value={tier} />
      {addOns.map((addOn) => (
        <input key={addOn} type="hidden" name="addOn" value={addOn} />
      ))}
      <Button type="submit" disabled={isPending} aria-busy={isPending} aria-describedby={message === null ? undefined : "membership-error"} className="group w-full">
        {isPending ? "Opening payment…" : `Pay ${amount}`}
        <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
      </Button>
      {message === null ? null : (
        <p id="membership-error" role="alert" className="mt-4 max-w-xl rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {message}
        </p>
      )}
    </form>
  );
}
