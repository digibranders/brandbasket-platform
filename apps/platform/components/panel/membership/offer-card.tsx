import type { ReactElement } from "react";
import { TagIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { LIFETIME_OFFER_HEADLINE, LIFETIME_OFFER_NOTE, LIFETIME_OFFER_PERCENT } from "@brandbasket/shared/lib/billing/lifetime-offer";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { AddOnMark } from "@/components/panel/membership/offer-marks";

interface OfferCardProps {
  /** The add-ons ticked so far: they are paid in the same payment as the plan. */
  readonly selected: readonly MonthlyAddOnId[];
  /** The address of this page with exactly these add-ons ticked: what each button goes to. */
  readonly hrefFor: (selection: readonly MonthlyAddOnId[]) => string;
  /** The plan's currency: the add-ons are paid with it. */
  readonly currency: MoneyCurrency;
}

/** One add-on: its mark, what it is, its lifetime price and the button that ticks it, or the tick that says it is in. */
function OfferRow({
  addOn,
  added,
  toggleHref,
  currency,
}: {
  readonly addOn: AddOn;
  readonly currency: MoneyCurrency;
  readonly added: boolean;
  /** Where the button goes: the page with this add-on ticked, or, when it already is, with it taken out again. */
  readonly toggleHref: string;
}): ReactElement {
  const offered = addOnPrice(addOn, currency, false, true);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-3 py-3.5 sm:gap-x-4 sm:py-4">
      <AddOnMark addOn={addOn.id} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">{addOn.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-ink-soft">{addOn.line}</p>
      </div>
      <div className="flex basis-full items-center justify-between gap-4 pl-[3.25rem] sm:basis-auto sm:justify-end sm:pl-0">
        <p className="text-left tabular-nums sm:text-right">
          <s className="block text-xs text-ink-soft">{formatMoney(offered.listCents, currency)}</s>
          <span className="block text-lg font-semibold leading-tight text-ink">{formatMoney(offered.netCents, currency)}</span>
          <span className="block text-xs text-ink-soft">{currency === "INR" ? "a month + GST" : "a month"}</span>
        </p>
        {added ? (
          <ButtonLink href={toggleHref} replace scroll={false} prefetch={false} size="sm" variant="secondary" aria-label={`Remove ${addOn.title}`} className="min-w-[5.5rem] text-success">
            <TickIcon className="size-4" />
            Added
          </ButtonLink>
        ) : (
          <ButtonLink href={toggleHref} replace scroll={false} prefetch={false} size="sm" aria-label={`Add ${addOn.title}`} className="min-w-[5.5rem]">
            Add
          </ButtonLink>
        )}
      </div>
    </li>
  );
}

/**
 * The first-checkout offer, shown until the first plan payment. The words are the owner's, verbatim (lifetime-offer.ts).
 * Each add-on ticks on or off with its own button and joins the plan in one payment; it is discounted only if it is taken
 * here: one left out stays at its full price.
 */
export function OfferCard({ selected, hrefFor, currency }: OfferCardProps): ReactElement {
  return (
    <section aria-label="Checkout offer" className="rounded-card border border-ink-soft/40 bg-accent-pale/55 p-4 sm:p-7">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="inline-flex rounded-full bg-gold/25 px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-deep sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.18em]">
            Exclusive checkout offer
          </p>
          <h2 className="mt-4 text-balance font-sans text-xl font-semibold leading-snug tracking-tight text-ink sm:mt-5 sm:text-[1.75rem] sm:leading-tight">{LIFETIME_OFFER_HEADLINE}</h2>
          <p className="mt-2 max-w-xl text-sm leading-snug text-ink-soft sm:mt-3 sm:text-base">{LIFETIME_OFFER_NOTE}</p>
        </div>
      </div>
      <ul aria-label="Add-ons at your lifetime price" className="mt-5 divide-y divide-ink-soft/25 border-y border-ink-soft/25">
        {ADD_ONS.map((addOn) => (
          <OfferRow
            key={addOn.id}
            addOn={addOn}
            added={selected.includes(addOn.id)}
            currency={currency}
            toggleHref={hrefFor(selected.includes(addOn.id) ? selected.filter((id) => id !== addOn.id) : [...selected, addOn.id])}
          />
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
