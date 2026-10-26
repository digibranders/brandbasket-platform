import type { ReactElement } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { Button, ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { addOnPrice, ADD_ONS, type AddOn, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { BundleLine } from "@brandbasket/shared/lib/billing/bundle";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { AddOnMark } from "@/components/panel/membership/offer-marks";
import { servicesAfterToggle } from "@/lib/membership";

interface PackageCardProps {
  /** The services in the basket: the whole subscription, paid in one payment. Never empty. */
  readonly selected: readonly MonthlyAddOnId[];
  /** The basket's lines as the order summary prices them, so a ticked service shows the price it will carry. */
  readonly lines: readonly BundleLine[];
  /** The address of this page with exactly these services in the basket: what each button goes to. */
  readonly hrefFor: (selection: readonly MonthlyAddOnId[]) => string;
  /** The plan's currency: the services are paid with it. */
  readonly currency: MoneyCurrency;
}

/**
 * One service: its mark, what it is, its price and the button that puts it in the basket, or the tick that says it is in.
 * The last service in the basket keeps its tick but cannot be taken out, so the basket is never empty.
 */
function ServiceRow({
  addOn,
  line,
  added,
  isLast,
  toggleHref,
  currency,
}: {
  readonly addOn: AddOn;
  /** The service's line in the basket, or null when it is not in it. */
  readonly line: BundleLine | null;
  readonly currency: MoneyCurrency;
  readonly added: boolean;
  readonly isLast: boolean;
  /** Where the button goes: the page with this service in the basket, or, when it already is, with it taken out again. */
  readonly toggleHref: string;
}): ReactElement {
  const listCents = addOnPrice(addOn, currency).netCents;
  const netCents = line?.netCents ?? listCents;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-3 py-3.5 sm:gap-x-4 sm:py-4">
      <AddOnMark addOn={addOn.id} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">{addOn.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-ink-soft">{addOn.line}</p>
      </div>
      <div className="flex basis-full items-center justify-between gap-4 pl-[3.25rem] sm:basis-auto sm:justify-end sm:pl-0">
        <p className="text-left tabular-nums sm:text-right">
          <span className="block text-lg font-semibold leading-tight text-ink">
            {netCents < listCents ? (
              <>
                <span className="sr-only">was </span>
                <s className="mr-2 text-xs font-normal text-ink-soft">{formatMoney(listCents, currency)}</s>
              </>
            ) : null}
            {formatMoney(netCents, currency)}
          </span>
          <span className="block text-xs text-ink-soft">{currency === "INR" ? "a month, GST included" : "a month"}</span>
        </p>
        {added && isLast ? (
          <Button type="button" size="sm" variant="secondary" disabled aria-label={`${addOn.title}, added, your only service`} className="min-w-[5.5rem] text-success">
            <TickIcon className="size-4" />
            Added
          </Button>
        ) : added ? (
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
 * The services in the basket until the first payment: all three, the website included. Each ticks in or out with its own
 * button and joins the one subscription, priced as the order summary prices the basket (lib/membership.ts orderSummary),
 * so a package shows its discount on every line it covers.
 */
export function PackageCard({ selected, lines, hrefFor, currency }: PackageCardProps): ReactElement {
  return (
    <section aria-label="Services" className="rounded-card border border-ink-soft/40 bg-accent-pale/55 p-4 sm:p-7">
      <ul className="divide-y divide-ink-soft/25 border-y border-ink-soft/25">
        {ADD_ONS.map((addOn) => {
          const added = selected.includes(addOn.id);
          return (
            <ServiceRow
              key={addOn.id}
              addOn={addOn}
              line={lines.find((line) => line.addOn === addOn.id) ?? null}
              added={added}
              isLast={selected.length === 1}
              currency={currency}
              toggleHref={hrefFor(servicesAfterToggle(selected, addOn.id))}
            />
          );
        })}
      </ul>
    </section>
  );
}
