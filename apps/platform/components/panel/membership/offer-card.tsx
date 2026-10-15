"use client";

import { useActionState, type ReactElement } from "react";
import { TickIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn } from "@fynix/shared/lib/billing/add-ons";
import { LIFETIME_OFFER_TEXT } from "@fynix/shared/lib/billing/lifetime-offer";
import { formatMoney } from "@fynix/shared/lib/money";
import { initialMembershipFormState, type MembershipFormState } from "@/lib/membership";

interface OfferCardProps {
  readonly action: (state: MembershipFormState, formData: FormData) => Promise<MembershipFormState>;
  /** The add-ons already bought at the offer price, by catalogue id. */
  readonly claimed: readonly string[];
}

/** One add-on's line: its lifetime price and the button that buys it now, or the tick that says it is bought. */
function OfferRow({ addOn, claimed, action }: { readonly addOn: AddOn; readonly claimed: boolean; readonly action: OfferCardProps["action"] }): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialMembershipFormState);
  const message = state.status === "error" && !isPending ? state.message : null;
  const offered = addOnPrice(addOn, false, true);
  return (
    <li className="py-2">
      <form action={formAction} className="flex items-center justify-between gap-3">
        <input type="hidden" name="addOn" value={addOn.id} />
        <div className="min-w-0 text-sm">
          <p className="text-ink">{addOn.title}</p>
          <p className="tabular-nums">
            <s className="text-ink-soft">{formatMoney(offered.listCents, "INR")}</s>{" "}
            <span className="font-medium text-accent-deep">{formatMoney(offered.netCents, "INR")}</span>
          </p>
        </div>
        {claimed ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <TickIcon className="size-4" />
            Added
          </span>
        ) : (
          <Button type="submit" size="sm" disabled={isPending} aria-busy={isPending} aria-label={`Add ${addOn.title}`}>
            {isPending ? "Opening…" : "Add"}
          </Button>
        )}
      </form>
      {message === null ? null : (
        <p role="alert" className="mt-2 text-sm text-accent-deep">
          {message}
        </p>
      )}
    </li>
  );
}

/**
 * The first-checkout offer, shown until the first plan payment. The words are the owner's, verbatim. Each add-on is its own
 * button and is discounted only if it is bought here: one left out stays at its full price afterwards.
 */
export function OfferCard({ action, claimed }: OfferCardProps): ReactElement {
  return (
    <section aria-label="Offer" className="rounded-control border border-accent bg-accent-pale px-4 py-4">
      <p className="text-sm font-medium leading-snug text-accent-deep">{LIFETIME_OFFER_TEXT}</p>
      <ul aria-label="Add-ons at your lifetime price" className="mt-3 divide-y divide-accent/20 border-y border-accent/20">
        {ADD_ONS.map((addOn) => (
          <OfferRow key={addOn.id} addOn={addOn} claimed={claimed.includes(addOn.id)} action={action} />
        ))}
      </ul>
    </section>
  );
}
