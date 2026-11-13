import type { ReactElement } from "react";
import { requestBrand } from "@/lib/server/request-brand";
import { MONITORING_ID, type AddOn, type AddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { cn } from "@brandbasket/shared/lib/cn";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { addBundledAddOnAction, removeBundledAddOnAction } from "@/app/app-host/(protected)/services/actions";
import { BundledAddOnAdd } from "@/components/panel/add-ons/bundled-add-on-add";
import { BundledAddOnRemove } from "@/components/panel/add-ons/bundled-add-on-remove";
import { SERVICE_DOT } from "@/components/v2/classes";
import { addOnDate, addOnStatus, planStartsAgain, type AddOnStatus } from "@/lib/billing/add-on-copy";
import { combinedSummary, planChangesFirst, quoteSummary } from "@/lib/billing/added-service";
import { dropCopy } from "@/lib/billing/drop-service";
import type { PaymentSummary } from "@/lib/billing/payment-summary";
import type { AddOnOffer, AddOnPageEntry } from "@/lib/server/add-ons";
import { PlansHeld } from "./plans-held";

/** A service's colour square before its name, the same one Overview and the rail use. */
const SERVICE_COLOUR: Readonly<Record<AddOnId, string>> = {
  "managed-website": SERVICE_DOT.website,
  "social-media": SERVICE_DOT.social,
  "paid-ads": SERVICE_DOT.social,
  // Monitoring watches over the other services; this app was retired before it was sold.
  "expert-monitoring": SERVICE_DOT.website,
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
  /** How many of the three plans are held, for monitoring's segments; null when there is no plan to count. */
  readonly plansHeld: { readonly held: number; readonly total: number } | null;
}

/** What Add would show before it opens a payment, for the offers that can be added; null for any other. */
function summaryOf(offer: AddOnOffer, addOn: AddOn, currency: AddOnPageEntry["price"]["currency"]): PaymentSummary | null {
  switch (offer.kind) {
    case "combined":
      return combinedSummary(offer, addOn.title, currency);
    case "quote":
      return quoteSummary(offer, addOn.title, currency);
    default:
      return null;
  }
}

/** On the first-month offer, what its first month costs ("₹1"); null for every other tile. */
function offerPriceOf(entry: AddOnPageEntry): string | null {
  return entry.kind === "available" && entry.offer.kind === "combined" && entry.offer.offer ? formatMoney(entry.offer.serviceCents, entry.price.currency) : null;
}

/**
 * One service as a tile (Plan & billing, direction A): its colour square and name with where it stands as a word, what it is, its
 * price, and the one thing to do about it. A service on the first-month offer says so and shows ₹1 beside its list price. One in the
 * plan's payment can be taken out from the next billing date (never the last one: that is cancelling), and one that is ending
 * kept; one that is not can be added (Add opens what is taken before anything is), or says why not and how to ask for it. Monitoring
 * shows how many of the three plans are held. The state line is a live region that is always in the page, so the change after
 * Remove is announced.
 */
export async function AddOnRow({ addOn, entry, canAdd, plansHeld }: AddOnRowProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const headingId = `add-on-${addOn.id}-heading`;
  const { price } = entry;
  const offerPrice = offerPriceOf(entry);
  const addSummary = entry.kind === "available" ? summaryOf(entry.offer, addOn, price.currency) : null;
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
  const note = entry.kind === "available" ? <AvailableNote addOn={addOn} offer={entry.offer} contactEmail={brand.contactEmail} writeToUs={writeToUs} /> : null;

  return (
    <li className={cn("grid content-start gap-3 rounded-lift p-5 shadow-lift", offerPrice === null ? "bg-surface" : "bg-rattan-wash")}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} tabIndex={-1} className="inline-flex min-w-0 items-center gap-2.5 font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink outline-none">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", SERVICE_COLOUR[addOn.id])} />
          {addOn.title}
        </h2>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", offerPrice === null ? STATUS_TONE[status.tone] : "bg-rattan-wash text-rattan-ink ring-1 ring-rattan-text/30")}>
          {offerPrice === null ? status.word : `${offerPrice} first month`}
        </span>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-ink-2">{addOn.line}</p>
      {addOn.platforms === undefined ? null : (
        <ul aria-label={`${addOn.title} runs on`} className="flex flex-wrap gap-2">
          {addOn.platforms.map((platform) => (
            <li key={platform} className="rounded-full bg-sunken px-3 py-1 text-xs text-ink-2">
              {platform}
            </li>
          ))}
        </ul>
      )}
      {addOn.id === MONITORING_ID && entry.kind === "available" && plansHeld !== null ? <PlansHeld held={plansHeld.held} total={plansHeld.total} /> : null}
      <p role="status" className="text-sm leading-relaxed text-ink-2 empty:hidden">
        {stateLine}
      </p>
      {note}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          {offerPrice !== null ? (
            <p className="flex items-baseline gap-2">
              <span className="font-figure text-[1.375rem] font-semibold tabular-nums text-ink">{offerPrice}</span>
              <span className="font-figure text-[0.8125rem] tabular-nums text-ink-2">
                <span className="sr-only">usually </span>
                <s>{formatMoney(price.listCents, price.currency)}</s>
              </span>
            </p>
          ) : (
            <>
              {price.discountCents > 0 ? <p className="font-figure text-[0.8125rem] tabular-nums text-ink-2 line-through">{formatMoney(price.listCents, price.currency)}</p> : null}
              <p className="font-figure text-[1.375rem] font-semibold tabular-nums text-ink">{formatMoney(price.netCents, price.currency)}</p>
            </>
          )}
          <p className="mt-0.5 text-[0.8125rem] text-ink-2">{addOn.extra === undefined ? addOn.unit : `${addOn.unit} ${addOn.extra}`}</p>
        </div>
        {entry.kind === "available" ? (
          canAdd && addSummary !== null ? (
            <BundledAddOnAdd
              addOn={addOn.id}
              title={addOn.title}
              savedText={entry.offer.kind === "quote" ? `${addOn.title} is on. It joins your monthly payment from ${addOnDate(entry.offer.renewsOn)}.` : `${addOn.title} is on.`}
              headingId={headingId}
              action={addBundledAddOnAction}
              summary={addSummary}
            />
          ) : null
        ) : entry.endsOn !== null && entry.keepable && canAdd ? (
          <BundledAddOnAdd
            addOn={addOn.id}
            title={addOn.title}
            savedText={`${addOn.title} stays. Your monthly payment does not change.`}
            headingId={headingId}
            action={addBundledAddOnAction}
            summary={null}
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

interface AvailableNoteProps {
  readonly addOn: AddOn;
  readonly offer: AddOnOffer;
  readonly contactEmail: string;
  readonly writeToUs: ReactElement;
}

/** For an add-on that cannot be added here: why, and what to do instead. Nothing for one that can (its Add opens the payment). */
function AvailableNote({ addOn, offer, contactEmail, writeToUs }: AvailableNoteProps): ReactElement | null {
  switch (offer.kind) {
    case "quote":
    case "combined":
      return null;
    case "change-pending":
      return <p className="text-sm text-ink-2">{planChangesFirst(offer.changesOn)}</p>;
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
