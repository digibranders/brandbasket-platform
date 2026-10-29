import Link from "next/link";
import type { ReactElement } from "react";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { continueToCheckoutAction, toggleServiceAction } from "@/app/app-host/(protected)/personalize/actions";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { personalizeHref } from "@/lib/intake/links";
import type { IntakeSummaryRow } from "@brandbasket/shared/lib/intake/questions";
import { servicesAfterToggle } from "@/lib/membership";

/** The last screen: what was understood about the business, the services (which can still change here), and Continue to checkout. */
export function IntakeSummary({
  rows,
  services,
  prices,
  currency,
  unanswered,
  firstUnansweredHref,
}: {
  readonly rows: readonly IntakeSummaryRow[];
  readonly services: readonly MonthlyAddOnId[];
  /** Each service's list price a month, formatted. */
  readonly prices: Readonly<Record<MonthlyAddOnId, string>>;
  readonly currency: MoneyCurrency;
  readonly unanswered: number;
  readonly firstUnansweredHref: string | null;
}): ReactElement {
  const basket = services.join(",");
  return (
    <div className="grid gap-8">
      <header className="grid gap-1.5">
        <h1 className="font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-ink">Here is what we understood</h1>
        <p className="text-base text-ink-2">We will carry this into your kickoff call. It is a starting point, not a brief, and nothing in it is final.</p>
      </header>

      <section aria-labelledby="intake-answers" className="grid gap-2">
        <h2 id="intake-answers" className="font-display text-lg font-semibold text-ink">About your business</h2>
        <dl className="divide-y divide-line rounded-control border border-line">
          {rows.map((row) => (
            <div key={row.field} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
              <dt className="text-[0.9375rem] text-ink-2">{row.label}</dt>
              <dd className={`min-w-0 break-words text-base ${row.value === null ? "text-ink-3" : "text-ink"} max-sm:col-span-2 max-sm:row-start-2`}>{row.value ?? "We will ask on the call"}</dd>
              <Link href={personalizeHref(services, row.field)} className="text-[0.9375rem] font-semibold text-ink underline decoration-line underline-offset-4">
                {row.value === null ? "Answer" : "Edit"}
              </Link>
            </div>
          ))}
        </dl>
        {unanswered > 0 && firstUnansweredHref !== null ? (
          <p className="text-[0.9375rem] text-ink-2">
            {unanswered === 1 ? "One question is" : `${unanswered} questions are`} still open for your services.{" "}
            <Link href={firstUnansweredHref} className="font-semibold text-ink underline decoration-line underline-offset-4">
              Answer {unanswered === 1 ? "it" : "them"}
            </Link>
            , or skip them and we will cover them on the call.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="intake-services" className="grid gap-2">
        <h2 id="intake-services" className="font-display text-lg font-semibold text-ink">Your services</h2>
        <p className="text-[0.9375rem] text-ink-2">Already chosen by you. Add another before checkout and any package saving updates by itself.</p>
        <ul className="divide-y divide-line rounded-control border border-line">
          {MONTHLY_ADD_ON_IDS.map((id) => {
            const on = services.includes(id);
            const onlyOne = on && servicesAfterToggle(services, id) === services;
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="grid">
                  <span className="text-base font-semibold text-ink">{addOnById(id).title}</span>
                  <span className="font-figure text-[0.9375rem] tabular-nums text-ink-2">{prices[id]} a month</span>
                </span>
                <form action={toggleServiceAction}>
                  <input type="hidden" name="services" value={basket} />
                  <input type="hidden" name="toggle" value={id} />
                  <button type="submit" disabled={onlyOne} className={`${SOFT_BUTTON} disabled:cursor-not-allowed disabled:opacity-45`} aria-label={`${on ? "Remove" : "Add"} ${addOnById(id).title}`}>
                    {on ? "Remove" : "Add"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <p className="sr-only">Prices in {currency}. {formatMoney(0, currency)} to set up.</p>
      </section>

      <form action={continueToCheckoutAction} className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
        <input type="hidden" name="services" value={basket} />
        <button type="submit" className={DARK_BUTTON}>
          Continue to checkout
        </button>
      </form>
    </div>
  );
}
