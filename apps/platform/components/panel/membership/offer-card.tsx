import type { ReactElement } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn, type AddOnId, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
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

/** An add-on this card offers: every service but the website, which the plan itself still is. */
type OfferedAddOn = AddOn & { readonly id: Exclude<AddOnId, "managed-website"> };

const OFFERED_ADD_ONS = ADD_ONS.filter((addOn): addOn is OfferedAddOn => addOn.id !== "managed-website");

/** One add-on: its mark, what it is, its price and the button that ticks it, or the tick that says it is in. */
function OfferRow({
  addOn,
  added,
  toggleHref,
  currency,
}: {
  readonly addOn: OfferedAddOn;
  readonly currency: MoneyCurrency;
  readonly added: boolean;
  /** Where the button goes: the page with this add-on ticked, or, when it already is, with it taken out again. */
  readonly toggleHref: string;
}): ReactElement {
  const price = addOnPrice(addOn, currency);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-3 py-3.5 sm:gap-x-4 sm:py-4">
      <AddOnMark addOn={addOn.id} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">{addOn.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-ink-soft">{addOn.line}</p>
      </div>
      <div className="flex basis-full items-center justify-between gap-4 pl-[3.25rem] sm:basis-auto sm:justify-end sm:pl-0">
        <p className="text-left tabular-nums sm:text-right">
          <span className="block text-lg font-semibold leading-tight text-ink">{formatMoney(price.netCents, currency)}</span>
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
 * The add-ons offered with the plan until the first plan payment. Each ticks on or off with its own button and joins the
 * plan in one payment, priced as lib/billing/bundle.ts prices the basket.
 */
export function OfferCard({ selected, hrefFor, currency }: OfferCardProps): ReactElement {
  return (
    <section aria-label="Add-ons" className="rounded-card border border-ink-soft/40 bg-accent-pale/55 p-4 sm:p-7">
      <ul aria-label="Add-ons" className="divide-y divide-ink-soft/25 border-y border-ink-soft/25">
        {OFFERED_ADD_ONS.map((addOn) => (
          <OfferRow
            key={addOn.id}
            addOn={addOn}
            added={selected.includes(addOn.id)}
            currency={currency}
            toggleHref={hrefFor(selected.includes(addOn.id) ? selected.filter((id) => id !== addOn.id) : [...selected, addOn.id])}
          />
        ))}
      </ul>
    </section>
  );
}
