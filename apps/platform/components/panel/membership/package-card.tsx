import type { ReactElement } from "react";
import Link from "next/link";
import { Check, GlobeSimple, MagnifyingGlass, Megaphone } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { addOnPrice, ADD_ONS, type AddOn, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { BundleLine } from "@brandbasket/shared/lib/billing/bundle";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
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

const MARKS: Readonly<Record<AddOn["id"], Icon>> = { "managed-website": GlobeSimple, "digital-growth": Megaphone, "local-seo-aeo": MagnifyingGlass };

/** A service's icon on a soft round mark, the one the rail uses for it. */
function ServiceMark({ addOn }: { readonly addOn: AddOn["id"] }): ReactElement {
  const Mark = MARKS[addOn];
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-ink">
      <Mark size={20} />
    </span>
  );
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
      <ServiceMark addOn={addOn.id} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">{addOn.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-ink-2">{addOn.line}</p>
      </div>
      <div className="flex basis-full items-center justify-between gap-4 pl-[3.25rem] sm:basis-auto sm:justify-end sm:pl-0">
        <p className="text-left tabular-nums sm:text-right">
          <span className="block text-lg font-semibold leading-tight text-ink">
            {netCents < listCents ? (
              <>
                <span className="sr-only">was </span>
                <s className="mr-2 text-xs font-normal text-ink-2">{formatMoney(listCents, currency)}</s>
              </>
            ) : null}
            {formatMoney(netCents, currency)}
          </span>
          <span className="block text-xs text-ink-2">{currency === "INR" ? "a month, GST included" : "a month"}</span>
        </p>
        {added && isLast ? (
          <button type="button" disabled aria-label={`${addOn.title}, added, your only service`} className={cn(SOFT_BUTTON, "min-w-[5.5rem] text-sage-deep disabled:cursor-not-allowed")}>
            <Check size={14} weight="bold" aria-hidden="true" />
            Added
          </button>
        ) : added ? (
          <Link href={toggleHref} replace scroll={false} prefetch={false} aria-label={`Remove ${addOn.title}`} className={cn(SOFT_BUTTON, "min-w-[5.5rem] text-sage-deep")}>
            <Check size={14} weight="bold" aria-hidden="true" />
            Added
          </Link>
        ) : (
          <Link href={toggleHref} replace scroll={false} prefetch={false} aria-label={`Add ${addOn.title}`} className={cn(SOFT_BUTTON, "min-w-[5.5rem]")}>
            Add
          </Link>
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
    <section aria-label="Services">
      <ul className="divide-y divide-line border-y border-line">
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
