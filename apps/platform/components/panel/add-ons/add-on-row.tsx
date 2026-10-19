import type { ReactElement } from "react";
import { requestBrand } from "@/lib/server/request-brand";
import { LIFETIME_OFFER_PERCENT } from "@brandbasket/shared/lib/billing/lifetime-offer";
import type { AddOn } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { removeBundledAddOnAction } from "@/app/app-host/(protected)/add-ons/actions";
import { BundledAddOnRemove } from "@/components/panel/add-ons/bundled-add-on-remove";
import { addOnDate } from "@/lib/billing/add-on-copy";
import type { AddOnPageEntry } from "@/lib/server/add-ons";

interface AddOnRowProps {
  readonly addOn: AddOn;
  readonly entry: AddOnPageEntry;
}

/**
 * One service: what it is and where it runs on the left, its price and where it stands on the right. One in the plan's
 * payment can be taken out from the next billing date; one that is not says how to ask for it. The state line is a live
 * region that is always in the page, so the change after Remove is announced.
 */
export async function AddOnRow({ addOn, entry }: AddOnRowProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const headingId = `add-on-${addOn.id}-heading`;
  const { price } = entry;
  const stateLine =
    entry.kind === "available"
      ? null
      : entry.endsOn === null
        ? "Included in your monthly plan payment."
        : `Stops on ${addOnDate(entry.endsOn)}. You won't be charged for it after that.`;

  return (
    <li className="py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="min-w-0">
          <h2 id={headingId} tabIndex={-1} className="panel-section outline-none">
            {addOn.title}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-ink-soft">{addOn.line}</p>
          {addOn.platforms === undefined ? null : (
            <ul aria-label={`${addOn.title} runs on`} className="mt-4 flex flex-wrap gap-2">
              {addOn.platforms.map((platform) => (
                <li key={platform} className="rounded-full bg-paper-deep px-3 py-1 text-xs text-ink-soft">
                  {platform}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-4 sm:max-w-xs sm:items-end sm:text-right">
          <div>
            {price.discountCents > 0 ? (
              <p className="text-sm tabular-nums text-ink-soft line-through">{formatMoney(price.listCents, price.currency)}</p>
            ) : null}
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(price.netCents, price.currency)}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{addOn.extra === undefined ? addOn.unit : `${addOn.unit} ${addOn.extra}`}</p>
            {price.offerCents > 0 ? <p className="mt-1 text-sm text-accent-deep">{LIFETIME_OFFER_PERCENT}% lifetime discount</p> : null}
          </div>
          <p role="status" className="text-sm tabular-nums text-ink-soft empty:hidden">
            {stateLine}
          </p>
          {entry.kind === "available" ? (
            <p className="text-sm text-ink-soft">
              To add it to your monthly payment, write to us at{" "}
              <a href={`mailto:${brand.contactEmail}?subject=${encodeURIComponent(`Add ${addOn.title}`)}`} className="link-underline text-ink">
                {brand.contactEmail}
              </a>
              .
            </p>
          ) : entry.endsOn === null && entry.nextBillingOn !== null ? (
            <BundledAddOnRemove
              addOn={addOn.id}
              title={addOn.title}
              endsOn={addOnDate(entry.nextBillingOn)}
              headingId={headingId}
              action={removeBundledAddOnAction}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}
