import Link from "next/link";
import type { ReactElement } from "react";
import { ResultLine } from "@/components/overview/result-line";
import { LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { dayMonth } from "@/lib/call-dates";
import { monthName } from "@/lib/overview";
import type { HomeData } from "@/lib/server/home";
import { ActivityList } from "./activity-list";
import { Attention } from "./attention";

/** A month into the service: what BrandBasket did for the customer, in figures that were measured and dated lines that were stored. */
export function OngoingHome({ data, now }: { readonly data: HomeData; readonly now: Date }): ReactElement {
  const overview = data.overview;
  return (
    <>
      <Attention items={data.attention} />
      <section aria-labelledby="home-month" className={`${LIFT} p-6`}>
        <h2 id="home-month" className="font-display text-lg font-semibold text-ink">
          {monthName(now)} so far
        </h2>
        {overview === null || overview.results.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-ink-2">Figures appear here once they have been measured. We never show a zero for something we have not counted.</p>
        ) : (
          <ul className="mt-2">
            {overview.results.map((line) => (
              <ResultLine key={`${line.service}-${line.headline}`} line={line} />
            ))}
          </ul>
        )}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ActivityList rows={overview?.activity ?? []} title="What we did" />
        <div className="grid content-start gap-6">
          {overview?.nextPayment == null ? null : (
            <section aria-labelledby="home-payment" className={`${LIFT} grid gap-1 p-6`}>
              <h2 id="home-payment" className="text-[0.9375rem] text-ink-3">
                Next payment
              </h2>
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-figure text-xl font-medium tabular-nums text-ink">{overview.nextPayment.amount ?? "To be confirmed"}</span>
                <span className="text-[0.9375rem] text-ink-2">{dayMonth(overview.nextPayment.date)}</span>
              </p>
              <Link href="/billing" className="text-[0.9375rem] font-semibold text-ink underline decoration-line underline-offset-4">
                Plan &amp; billing
              </Link>
            </section>
          )}
          <Link href="/requests/new" className={`${SOFT_BUTTON} justify-self-start`}>
            New request
          </Link>
        </div>
      </div>
    </>
  );
}
