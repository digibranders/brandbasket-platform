import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { dayMonth } from "@/lib/call-dates";
import { SERVICE_NAMES } from "@/lib/first-look";
import { greetingFor, monthName, sublineFor } from "@/lib/overview";
import type { OverviewData } from "@/lib/server/overview";
import type { TodoItem } from "@/lib/todo";
import { DARK_BUTTON, LIFT, SECTION_TITLE, SERVICE_DOT, SOFT_BUTTON } from "@/components/v2/classes";
import { ResultLine } from "./result-line";

/** Open items shown before the rest fold into "See all". */
const OPEN_SHOWN = 4;

interface MonthOverviewProps {
  readonly firstName: string;
  readonly businessName: string;
  readonly data: OverviewData;
  readonly now: Date;
  /** The website's build card while the website is not live, else null. */
  readonly buildCard: ReactNode | null;
  readonly bookingUrl: string | null;
}

/** A website item opens its page; a Social or Search item opens its form on the To do page. */
const itemHref = (item: TodoItem): string => (item.kind === "link" ? item.href : `/todo#${item.key}`);

function NeedsYou({ open, count }: { readonly open: readonly TodoItem[]; readonly count: number }): ReactElement {
  if (count === 0) return <p className="text-sm text-ink-2">Nothing needs you right now.</p>;
  return (
    <section aria-labelledby="needs-you-title" className={cn(LIFT, "p-5")}>
      <h2 id="needs-you-title" className={SECTION_TITLE}>
        Needs you
      </h2>
      <ul>
        {open.slice(0, OPEN_SHOWN).map((item, index) => (
          <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 last:border-b-0">
            <span className="min-w-0">
              <span className="block text-[0.84375rem] font-semibold text-ink">{item.label}</span>
              <span className="block text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", SERVICE_DOT[item.service])} />
                  {SERVICE_NAMES[item.service]}
                </span>{" "}
                · {item.hint}
              </span>
            </span>
            <Link href={itemHref(item)} aria-label={`Open ${item.label}`} className={index === 0 ? DARK_BUTTON : SOFT_BUTTON}>
              Open
            </Link>
          </li>
        ))}
      </ul>
      {count > OPEN_SHOWN ? (
        <Link href="/todo" className="mt-3 inline-block text-[0.8125rem] font-semibold text-ink underline underline-offset-[3px]">
          See all {count}
        </Link>
      ) : null}
    </section>
  );
}

/** Overview once the first look is over: does anything need me, what did I get this month, what did you do. */
export function MonthOverview({ firstName, businessName, data, now, buildCard, bookingUrl }: MonthOverviewProps): ReactElement {
  const month = monthName(now);
  const open = data.todo.filter((item) => !item.done);
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">
            {greetingFor(now)}, {firstName}.
          </h1>
          <p className="mt-2 text-[0.84375rem] text-ink-2">{sublineFor(data.open)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/support" className={SOFT_BUTTON}>
            Ask for a change
          </Link>
          {bookingUrl === null ? null : (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
              Book a call
            </a>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          {buildCard}
          <NeedsYou open={open} count={data.open} />
          <section aria-labelledby="results-title">
            <h2 id="results-title" className={SECTION_TITLE}>
              {month} for {businessName}
            </h2>
            {data.results.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">Numbers for {month} will appear here once we have them.</p>
            ) : (
              <ul>
                {data.results.map((line) => (
                  <ResultLine key={line.service} line={line} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-6">
          <section aria-labelledby="did-title">
            <h2 id="did-title" className={SECTION_TITLE}>
              What we did
            </h2>
            {data.activity.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">Updates will appear here as we work.</p>
            ) : (
              <ul>
                {data.activity.map((row) => (
                  <li key={row.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-b border-line py-3 text-[0.84375rem] last:border-b-0">
                    <time dateTime={row.at.toISOString()} className="font-figure text-xs tabular-nums text-ink-2">
                      {dayMonth(row.at)}
                    </time>
                    <span className="text-ink">{row.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {data.nextPayment === null ? null : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.84375rem]">
              <dt className="text-ink-2">Next payment</dt>
              <dd className="text-right font-figure font-semibold tabular-nums text-ink">
                {data.nextPayment.amount === null ? dayMonth(data.nextPayment.date) : `${data.nextPayment.amount} on ${dayMonth(data.nextPayment.date)}`}
              </dd>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
