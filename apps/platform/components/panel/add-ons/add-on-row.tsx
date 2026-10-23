import type { ReactElement } from "react";
import { requestBrand } from "@/lib/server/request-brand";
import type { AddOn } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { addBundledAddOnAction, removeBundledAddOnAction } from "@/app/app-host/(protected)/services/actions";
import { BundledAddOnAdd } from "@/components/panel/add-ons/bundled-add-on-add";
import { BundledAddOnRemove } from "@/components/panel/add-ons/bundled-add-on-remove";
import { addOnDate, planStartsAgain } from "@/lib/billing/add-on-copy";
import { dropCopy } from "@/lib/billing/drop-service";
import type { AddOnOffer, AddOnPageEntry } from "@/lib/server/add-ons";

interface AddOnRowProps {
  readonly addOn: AddOn;
  readonly entry: AddOnPageEntry;
  /** False while a payment for an add-on is being confirmed: no second Add until it is. */
  readonly canAdd: boolean;
}

/**
 * One service: what it is and where it runs on the left, its price and where it stands on the right. One in the plan's
 * payment can be taken out from the next billing date (never the last one: that is cancelling), and one that is ending
 * kept; one that is not can be added for the rest of the paid month, or says how to ask for it. The state line is a live
 * region that is always in the page, so the change after Remove is announced.
 */
export async function AddOnRow({ addOn, entry, canAdd }: AddOnRowProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const headingId = `add-on-${addOn.id}-heading`;
  const { price } = entry;
  const stateLine =
    entry.kind === "available"
      ? null
      : entry.endsOn !== null
        ? `Stops on ${addOnDate(entry.endsOn)}. You won't be charged for it after that.`
        : entry.joinsOn !== null
          ? `${addOn.title} is on. It joins your monthly payment from ${addOnDate(entry.joinsOn)}.`
          : "Included in your monthly plan payment.";
  const writeToUs = (
    <p className="text-sm text-ink-soft">
      To add it to your monthly payment, write to us at{" "}
      <a href={`mailto:${brand.contactEmail}?subject=${encodeURIComponent(`Add ${addOn.title}`)}`} className="link-underline text-ink">
        {brand.contactEmail}
      </a>
      .
    </p>
  );

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
          </div>
          <p role="status" className="text-sm tabular-nums text-ink-soft empty:hidden">
            {stateLine}
          </p>
          {entry.kind === "available" ? (
            <AvailableAddOn addOn={addOn} entry={entry} canAdd={canAdd} headingId={headingId} contactEmail={brand.contactEmail} writeToUs={writeToUs} />
          ) : entry.endsOn !== null && entry.keepable && canAdd ? (
            <BundledAddOnAdd
              addOn={addOn.id}
              title={addOn.title}
              savedText={`${addOn.title} stays. Your monthly payment does not change.`}
              headingId={headingId}
              action={addBundledAddOnAction}
            />
          ) : entry.endsOn === null && entry.nextBillingOn !== null && entry.drop !== null ? (
            <BundledAddOnRemove
              addOn={addOn.id}
              title={addOn.title}
              endsOn={addOnDate(entry.nextBillingOn)}
              copy={dropCopy(entry.drop, addOnDate(entry.nextBillingOn))}
              headingId={headingId}
              action={removeBundledAddOnAction}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

interface AvailableAddOnProps {
  readonly addOn: AddOn;
  readonly entry: Extract<AddOnPageEntry, { kind: "available" }>;
  readonly canAdd: boolean;
  readonly headingId: string;
  readonly contactEmail: string;
  readonly writeToUs: ReactElement;
}

/** "₹3,730.32 today for the 14 days left this month, then ₹11,798.82 a month from 19 November 2026, GST included." */
function quoteLine(offer: Extract<AddOnOffer, { kind: "quote" }>, price: AddOnPageEntry["price"]): string {
  const days = offer.daysLeft === 1 ? "the 1 day left" : `the ${offer.daysLeft} days left`;
  const tax = price.taxRateBasisPoints > 0 ? ", GST included" : "";
  return `${formatMoney(offer.chargeCents, price.currency)} today for ${days} this month, then ${formatMoney(offer.nextRenewalCents, price.currency)} a month from ${addOnDate(offer.renewsOn)}${tax}.`;
}

/** An add-on not in the plan's payment: Add with what it costs, or why it cannot be added here and what to do instead. */
function AvailableAddOn({ addOn, entry, canAdd, headingId, contactEmail, writeToUs }: AvailableAddOnProps): ReactElement {
  const { offer } = entry;
  switch (offer.kind) {
    case "quote":
      return (
        <div className="space-y-3 sm:text-right">
          {canAdd ? (
            <BundledAddOnAdd
            addOn={addOn.id}
            title={addOn.title}
            savedText={`${addOn.title} is on. It joins your monthly payment from ${addOnDate(offer.renewsOn)}.`}
            headingId={headingId}
              action={addBundledAddOnAction}
            />
          ) : null}
          <p className="max-w-xs text-sm tabular-nums text-ink-soft">{quoteLine(offer, entry.price)}</p>
        </div>
      );
    case "renewal-due":
      return offer.renewsOn === null ? (
        writeToUs
      ) : (
        <p className="text-sm text-ink-soft">Your payment is due within the hour. Add it after {addOnDate(offer.renewsOn)}.</p>
      );
    case "manual":
      return (
        <p className="text-sm text-ink-soft">
          You pay us by bank transfer, so write to{" "}
          <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Add ${addOn.title}`)}`} className="link-underline text-ink">
            {contactEmail}
          </a>{" "}
          and we&apos;ll add it.
        </p>
      );
    case "plan-kept":
      return <p className="text-sm text-ink-soft">{planStartsAgain(offer.startsOn)}</p>;
    case "write":
      return writeToUs;
    default: {
      const unhandled: never = offer;
      throw new Error(`Unhandled add-on offer: ${JSON.stringify(unhandled)}`);
    }
  }
}
