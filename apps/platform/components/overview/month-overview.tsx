import { ChartLineUp, CheckCircle, ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { includedEditsUsedLine } from "@brandbasket/shared/lib/change-requests";
import { cn } from "@brandbasket/shared/lib/cn";
import { BookCallButton } from "@/components/calls/book-call-button";
import { dayMonth } from "@/lib/call-dates";
import type { BookCallOptions } from "@/lib/calls/form";
import { SERVICE_NAMES } from "@/lib/first-look";
import { greetingFor, monthName, sublineFor } from "@/lib/overview";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import type { NeedsYouRow } from "@/lib/requests/needs";
import type { OverviewData } from "@/lib/server/overview";
import { todoItemHref, type TodoItem } from "@/lib/todo";
import { DARK_BUTTON, LIFT, SECTION_TITLE, SERVICE_DOT, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, FactRows, PageColumns, PageFrame, PageSection } from "@/components/v2/page";
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
  /** The customer has a website that is not live yet, so the line under the greeting says we are setting up. */
  readonly settingUp: boolean;
  readonly bookingUrl: string | null;
  /** The reasons a call can be about for this customer, and whether an invitation can reach them (Book a call). */
  readonly callOptions: BookCallOptions["options"];
  readonly canBook: boolean;
}

const FIGURE = "font-figure font-semibold tabular-nums";

/** A website item opens its page; a Social or Search item opens its form on the To do page. */
const itemHref = (item: TodoItem): string => (item.kind === "link" ? item.href : todoItemHref(item.key));

const toRow = (item: TodoItem): NeedsYouRow => ({ key: item.key, label: item.label, hint: item.hint, service: item.service, href: itemHref(item) });

function NeedsYou({ rows, count }: { readonly rows: readonly NeedsYouRow[]; readonly count: number }): ReactElement {
  if (count === 0) return <EmptyState compact icon={CheckCircle} title="Nothing needs you right now." />;
  return (
    <section aria-labelledby="needs-you-title" className={cn(LIFT, "p-5")}>
      <h2 id="needs-you-title" className={SECTION_TITLE}>
        Needs you
      </h2>
      <ul>
        {rows.slice(0, OPEN_SHOWN).map((item, index) => (
          <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 last:border-b-0">
            <span className="min-w-0">
              <span className="block text-[0.84375rem] font-semibold text-ink">{item.label}</span>
              <span className="block text-xs text-ink-2">
                {item.service === null ? null : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", SERVICE_DOT[item.service])} />
                      {SERVICE_NAMES[item.service]}
                    </span>{" "}
                    ·{" "}
                  </>
                )}
                {item.hint}
              </span>
            </span>
            <Link href={item.href} aria-label={`Open ${item.label}`} className={index === 0 ? DARK_BUTTON : SOFT_BUTTON}>
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
export function MonthOverview({ firstName, businessName, data, now, buildCard, settingUp, bookingUrl, callOptions, canBook }: MonthOverviewProps): ReactElement {
  const month = monthName(now);
  // A quote to accept or a change to check is a conversation waiting on the customer, so it comes before the To do items.
  const rows = [...data.requests, ...data.todo.filter((item) => !item.done).map(toRow)];
  const facts = [
    ...(data.included === null ? [] : [{ label: "Included edits this month", value: <span className={FIGURE}>{includedEditsUsedLine(data.included.used, data.included.allowed)}</span> }]),
    ...(data.nextCall === null ? [] : [{ label: "Next call", value: <span className={FIGURE}>{data.nextCall}</span> }]),
    ...(data.nextPayment === null
      ? []
      : [
          {
            label: "Next payment",
            value: (
              <span className={FIGURE}>
                {data.nextPayment.amount === null ? dayMonth(data.nextPayment.date) : `${data.nextPayment.amount} on ${dayMonth(data.nextPayment.date)}`}
              </span>
            ),
          },
        ]),
  ];
  return (
    <PageFrame
      title={`${greetingFor(now)}, ${firstName}.`}
      lede={sublineFor(data.open, settingUp)}
      action={
        <>
          <Link href={ASK_FOR_A_CHANGE_PATH} className={SOFT_BUTTON}>
            Ask for a change
          </Link>
          {bookingUrl === null ? null : <BookCallButton options={callOptions} bookingUrl={bookingUrl} canBook={canBook} />}
        </>
      }
    >
      <PageColumns
        main={
          <>
            <NeedsYou rows={rows} count={data.open} />
            <PageSection id="results" title={`${month} for ${businessName}`} flush>
              {data.results.length === 0 ? (
                <div className="pt-4">
                  <EmptyState compact icon={ChartLineUp} title="No numbers yet" text={`Numbers for ${month} will appear here once we have them.`} />
                </div>
              ) : (
                <ul>
                  {data.results.map((line) => (
                    <ResultLine key={line.service} line={line} />
                  ))}
                </ul>
              )}
            </PageSection>
            <PageSection id="did" title="What we did" flush>
              {data.activity.length === 0 ? (
                <div className="pt-4">
                  <EmptyState compact icon={ClockCounterClockwise} title="No updates yet" text="Updates will appear here as we work." />
                </div>
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
            </PageSection>
          </>
        }
        aside={
          buildCard === null && facts.length === 0 ? null : (
            <>
              {buildCard}
              {facts.length === 0 ? null : (
                <PageSection id="month" title="This month">
                  <FactRows items={facts} />
                </PageSection>
              )}
            </>
          )
        }
      />
    </PageFrame>
  );
}
