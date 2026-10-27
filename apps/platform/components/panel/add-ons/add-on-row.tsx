import type { ReactElement } from "react";
import { requestBrand } from "@/lib/server/request-brand";
import type { AddOn, AddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { cn } from "@brandbasket/shared/lib/cn";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { addBundledAddOnAction, removeBundledAddOnAction } from "@/app/app-host/(protected)/services/actions";
import { BundledAddOnAdd } from "@/components/panel/add-ons/bundled-add-on-add";
import { BundledAddOnRemove } from "@/components/panel/add-ons/bundled-add-on-remove";
import { SERVICE_DOT } from "@/components/v2/classes";
import { addOnDate, addOnStatus, planStartsAgain, type AddOnStatus } from "@/lib/billing/add-on-copy";
import { dropCopy } from "@/lib/billing/drop-service";
import type { AddOnOffer, AddOnPageEntry } from "@/lib/server/add-ons";

/** A service's colour square before its name, the same one Overview and the rail use. */
const SERVICE_COLOUR: Readonly<Record<AddOnId, string>> = {
  "managed-website": SERVICE_DOT.website,
  "digital-growth": SERVICE_DOT.social,
  "local-seo-aeo": SERVICE_DOT.search,
};

const STATUS_TONE: Readonly<Record<AddOnStatus["tone"], string>> = {
  on: "bg-sage-wash text-sage-deep",
  ending: "bg-rattan-wash text-rattan-ink",
  off: "bg-sunken text-ink-2",
};

interface AddOnRowProps {
  readonly addOn: AddOn;
  readonly entry: AddOnPageEntry;
  /** False while a payment for an add-on is being confirmed: no second Add until it is. */
  readonly canAdd: boolean;
}

/**
 * One service: what it is and where it runs on the left, its price beside it, and where it stands with what can be done about it on the right. One in the plan's
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
  const status = addOnStatus(entry);
  const writeToUs = (
    <p className="text-sm text-ink-2">
      To add it to your monthly payment, write to us at{" "}
      <a href={`mailto:${brand.contactEmail}?subject=${encodeURIComponent(`Add ${addOn.title}`)}`} className="font-semibold text-ink underline underline-offset-[3px]">
        {brand.contactEmail}
      </a>
      .
    </p>
  );

  return (
    <li className="grid gap-5 py-6 md:grid-cols-[minmax(0,1fr)_11rem_minmax(14rem,22rem)] md:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={headingId} tabIndex={-1} className="inline-flex items-center gap-2.5 font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink outline-none">
            <span aria-hidden="true" className={cn("size-2 rounded-[2px]", SERVICE_COLOUR[addOn.id])} />
            {addOn.title}
          </h2>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status.tone])}>{status.word}</span>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">{addOn.line}</p>
        {addOn.platforms === undefined ? null : (
          <ul aria-label={`${addOn.title} runs on`} className="mt-3 flex flex-wrap gap-2">
            {addOn.platforms.map((platform) => (
              <li key={platform} className="rounded-full bg-sunken px-3 py-1 text-xs text-ink-2">
                {platform}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {price.discountCents > 0 ? <p className="font-figure text-[0.8125rem] tabular-nums text-ink-2 line-through">{formatMoney(price.listCents, price.currency)}</p> : null}
        <p className="font-figure text-[1.375rem] font-semibold tabular-nums text-ink">{formatMoney(price.netCents, price.currency)}</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-2">{addOn.extra === undefined ? addOn.unit : `${addOn.unit} ${addOn.extra}`}</p>
      </div>
      <div className="grid content-start justify-items-start gap-3">
        <p role="status" className="text-sm leading-relaxed text-ink-2 empty:hidden">
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
        <div className="space-y-3">
          {canAdd ? (
            <BundledAddOnAdd
            addOn={addOn.id}
            title={addOn.title}
            savedText={`${addOn.title} is on. It joins your monthly payment from ${addOnDate(offer.renewsOn)}.`}
            headingId={headingId}
              action={addBundledAddOnAction}
            />
          ) : null}
          <p className="max-w-xs text-sm leading-relaxed tabular-nums text-ink-2">{quoteLine(offer, entry.price)}</p>
        </div>
      );
    case "renewal-due":
      return offer.renewsOn === null ? (
        writeToUs
      ) : (
        <p className="text-sm text-ink-2">Your payment is due within the hour. Add it after {addOnDate(offer.renewsOn)}.</p>
      );
    case "manual":
      return (
        <p className="text-sm text-ink-2">
          You pay us by bank transfer, so write to{" "}
          <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Add ${addOn.title}`)}`} className="font-semibold text-ink underline underline-offset-[3px]">
            {contactEmail}
          </a>{" "}
          and we&apos;ll add it.
        </p>
      );
    case "plan-kept":
      return <p className="text-sm text-ink-2">{planStartsAgain(offer.startsOn)}</p>;
    case "write":
      return writeToUs;
    default: {
      const unhandled: never = offer;
      throw new Error(`Unhandled add-on offer: ${JSON.stringify(unhandled)}`);
    }
  }
}
