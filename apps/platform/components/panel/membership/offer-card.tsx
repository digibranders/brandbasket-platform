"use client";

import { useActionState, type ReactElement } from "react";
import { TagIcon, TickIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn } from "@fynix/shared/lib/billing/add-ons";
import { LIFETIME_OFFER_HEADLINE, LIFETIME_OFFER_NOTE, LIFETIME_OFFER_PERCENT } from "@fynix/shared/lib/billing/lifetime-offer";
import { formatMoney } from "@fynix/shared/lib/money";
import { AddOnMark, PlatformBadges } from "@/components/panel/membership/offer-marks";
import { initialMembershipFormState, type MembershipFormState } from "@/lib/membership";

interface OfferCardProps {
  readonly action: (state: MembershipFormState, formData: FormData) => Promise<MembershipFormState>;
  /** The add-ons already bought at the offer price, by catalogue id. */
  readonly claimed: readonly string[];
}

/** One add-on: its mark, what it is, its lifetime price and the button that buys it now, or the tick that says it is bought. */
function OfferRow({ addOn, claimed, action }: { readonly addOn: AddOn; readonly claimed: boolean; readonly action: OfferCardProps["action"] }): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialMembershipFormState);
  const message = state.status === "error" && !isPending ? state.message : null;
  const offered = addOnPrice(addOn, false, true);
  return (
    <li className="py-3.5 sm:py-4">
      <form action={formAction} className="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-4">
        <input type="hidden" name="addOn" value={addOn.id} />
        <AddOnMark addOn={addOn.id} />
        <div className="min-w-[10rem] flex-1">
          <p className="text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">{addOn.title}</p>
          <p className="mt-0.5 text-sm leading-snug text-ink-soft">{addOn.line}</p>
        </div>
        <div className="flex basis-full items-center justify-between gap-4 pl-[3.25rem] sm:basis-auto sm:justify-end sm:pl-0">
          <p className="text-left tabular-nums sm:text-right">
            <s className="block text-xs text-ink-soft">{formatMoney(offered.listCents, "INR")}</s>
            <span className="block text-lg font-semibold leading-tight text-ink">{formatMoney(offered.netCents, "INR")}</span>
            <span className="block text-xs text-ink-soft">a month + GST</span>
          </p>
          {claimed ? (
            <span className="inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 text-sm font-semibold text-success">
              <TickIcon className="size-4" />
              Added
            </span>
          ) : (
            <Button type="submit" size="sm" disabled={isPending} aria-busy={isPending} aria-label={`Add ${addOn.title}`} className="min-w-[5.5rem]">
              {isPending ? "Opening…" : "Add"}
            </Button>
          )}
        </div>
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
    <section aria-label="Checkout offer" className="rounded-card border border-ink-soft/40 bg-accent-pale/55 p-4 sm:p-7">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="inline-flex rounded-full bg-gold/25 px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-deep sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]">
            Exclusive checkout offer
          </p>
          <h2 className="mt-4 text-balance font-sans text-xl font-semibold leading-snug tracking-tight text-ink sm:mt-5 sm:text-[1.75rem] sm:leading-tight">{LIFETIME_OFFER_HEADLINE}</h2>
          <p className="mt-2 max-w-md text-sm leading-snug text-ink-soft sm:mt-3 sm:text-base">{LIFETIME_OFFER_NOTE}</p>
        </div>
        <PlatformBadges className="hidden h-32 w-40 shrink-0 sm:block" />
      </div>
      <ul aria-label="Add-ons at your lifetime price" className="mt-5 divide-y divide-ink-soft/25 border-y border-ink-soft/25">
        {ADD_ONS.map((addOn) => (
          <OfferRow key={addOn.id} addOn={addOn} claimed={claimed.includes(addOn.id)} action={action} />
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-3 rounded-control bg-accent-pale px-3.5 py-3 text-sm sm:mt-5 sm:px-4 sm:py-3.5 leading-snug text-accent-deep">
        <TagIcon className="mt-0.5 size-5 shrink-0" />
        <span>
          Your extra <strong className="font-semibold">{LIFETIME_OFFER_PERCENT}% lifetime discount</strong> is applied automatically to each package you add here.
        </span>
      </p>
    </section>
  );
}
