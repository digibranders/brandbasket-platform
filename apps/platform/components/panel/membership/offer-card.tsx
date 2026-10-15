"use client";

import { useActionState, type ReactElement } from "react";
import { PhoneIcon, RocketIcon, TagIcon, TickIcon, UsersIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn, type AddOnId } from "@fynix/shared/lib/billing/add-ons";
import { LIFETIME_OFFER_HEADLINE, LIFETIME_OFFER_NOTE, LIFETIME_OFFER_PERCENT } from "@fynix/shared/lib/billing/lifetime-offer";
import { formatMoney } from "@fynix/shared/lib/money";
import { initialMembershipFormState, type MembershipFormState } from "@/lib/membership";

interface OfferCardProps {
  readonly action: (state: MembershipFormState, formData: FormData) => Promise<MembershipFormState>;
  /** The add-ons already bought at the offer price, by catalogue id. */
  readonly claimed: readonly string[];
}

/** Each add-on's mark: a tinted tile and its own icon, so the three read apart at a glance. */
const MARKS: Readonly<Record<AddOnId, { readonly tile: string; readonly icon: ReactElement }>> = {
  "social-media": { tile: "bg-accent-pale text-accent-deep", icon: <UsersIcon className="size-5" /> },
  "lead-generation": { tile: "bg-paper-deep text-ink", icon: <PhoneIcon className="size-5" /> },
  advertising: { tile: "bg-success/15 text-success", icon: <RocketIcon className="size-5" /> },
};

/** One add-on: what it is, its lifetime price, and the button that buys it now, or the tick that says it is bought. */
function OfferRow({ addOn, claimed, action }: { readonly addOn: AddOn; readonly claimed: boolean; readonly action: OfferCardProps["action"] }): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialMembershipFormState);
  const message = state.status === "error" && !isPending ? state.message : null;
  const offered = addOnPrice(addOn, false, true);
  const mark = MARKS[addOn.id];
  return (
    <li className="py-3.5">
      <form action={formAction} className="flex items-start gap-3">
        <input type="hidden" name="addOn" value={addOn.id} />
        <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-control ${mark.tile}`}>
          {mark.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-ink">{addOn.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-ink-soft">{addOn.line}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <s className="text-xs text-ink-soft">{formatMoney(offered.listCents, "INR")}</s>
            <span className="text-base font-semibold text-ink">{formatMoney(offered.netCents, "INR")}</span>
            <span className="text-xs text-ink-soft">a month + GST</span>
          </p>
        </div>
        {claimed ? (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-success">
            <TickIcon className="size-4" />
            Added
          </span>
        ) : (
          <Button type="submit" size="sm" variant="secondary" disabled={isPending} aria-busy={isPending} aria-label={`Add ${addOn.title}`} className="shrink-0">
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
 * The first-checkout offer, shown until the first plan payment. The words are the owner's, verbatim (lifetime-offer.ts).
 * Each add-on is its own button and is discounted only if it is bought here: one left out stays at its full price.
 */
export function OfferCard({ action, claimed }: OfferCardProps): ReactElement {
  return (
    <section aria-label="Checkout offer" className="rounded-card border border-accent/40 bg-accent-pale/60 p-4 sm:p-5">
      <p className="inline-flex rounded-full bg-gold/25 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-deep">
        Checkout offer
      </p>
      <h2 className="mt-3 font-serif text-xl leading-snug text-ink">{LIFETIME_OFFER_HEADLINE}</h2>
      <p className="mt-1.5 text-sm text-ink-soft">{LIFETIME_OFFER_NOTE}</p>
      <ul aria-label="Add-ons at your lifetime price" className="mt-3 divide-y divide-accent/20 border-t border-accent/20">
        {ADD_ONS.map((addOn) => (
          <OfferRow key={addOn.id} addOn={addOn} claimed={claimed.includes(addOn.id)} action={action} />
        ))}
      </ul>
      <p className="flex items-start gap-2.5 rounded-control bg-accent-pale px-3.5 py-3 text-sm leading-snug text-accent-deep">
        <TagIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          Each add-on you add here keeps <strong className="font-semibold">{LIFETIME_OFFER_PERCENT}% off for life</strong>. Skip one and it stays at its full price.
        </span>
      </p>
    </section>
  );
}
