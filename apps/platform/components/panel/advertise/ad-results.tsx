"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { AD_PLACEMENT_LABELS, formatAdWeek } from "@firstfold/shared/lib/directory/ads";
import { formatClickRate, type AdResults, type Tally } from "@/lib/advertise-results";

/*
 * Results for one ad at a time: pick an ad (a spot and the week it ran) or "All ads", and see how many people saw it,
 * how many clicked, the click rate and two small charts by day. Numbers and shapes, little text. "Seen" is people,
 * once a day each.
 */

const ALL = "all";
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

const count = (value: number): string => value.toLocaleString("en-IN");

function Bars({ values, label, letters }: { readonly values: readonly number[]; readonly label: string; readonly letters: boolean }): ReactElement {
  const max = Math.max(1, ...values);
  const step = letters ? 18 : 6;
  const bar = letters ? 12 : 4.5;
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${values.length * step} 40`} className="h-10 w-full max-w-64 text-accent" preserveAspectRatio="none">
        {values.map((value, index) => {
          const height = value === 0 ? 1 : Math.max(2, (value / max) * 40);
          return <rect key={index} x={index * step} y={40 - height} width={bar} height={height} rx={1} fill="currentColor" opacity={value === 0 ? 0.25 : 1} />;
        })}
      </svg>
      {letters ? (
        <div aria-hidden="true" className="mt-1 grid max-w-64 grid-cols-7 text-[0.6875rem] text-ink-soft">
          {DAY_LETTERS.map((letter, index) => (
            <span key={index}>{letter}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Figure({ value, label }: { readonly value: string; readonly label: string }): ReactElement {
  return (
    <div>
      <dd className="heading-display whitespace-nowrap text-4xl tabular-nums">{value}</dd>
      <dt className="mt-1 text-[0.8125rem] text-ink-soft">{label}</dt>
    </div>
  );
}

function Detail({ tally, name, letters }: { readonly tally: Tally; readonly name: string; readonly letters: boolean }): ReactElement {
  return (
    <div className="mt-6 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
      <dl className="grid grid-cols-3 gap-x-8 gap-y-4">
        <Figure value={count(tally.seen)} label="Seen" />
        <Figure value={count(tally.clicks)} label="Clicks" />
        <Figure value={formatClickRate(tally.clickRate)} label="Click rate" />
      </dl>
      <div>
        <p className="mb-2 text-xs text-ink-soft">Seen each day</p>
        <Bars values={tally.seenByDay} label={`${name}: people who saw it each day`} letters={letters} />
      </div>
      <div>
        <p className="mb-2 text-xs text-ink-soft">Clicks each day</p>
        <Bars values={tally.clicksByDay} label={`${name}: clicks each day`} letters={letters} />
      </div>
    </div>
  );
}

export function AdResultsView({ results, days }: { readonly results: AdResults; readonly days: number }): ReactElement {
  const [picked, setPicked] = useState<string>(results.bookings[0]?.id ?? ALL);
  const booking = results.bookings.find((entry) => entry.id === picked);
  const options: readonly SelectOption[] = [
    ...results.bookings.map((entry) => ({ value: entry.id, label: `${AD_PLACEMENT_LABELS[entry.placement]} · ${formatAdWeek(entry.weekStart)}` })),
    { value: ALL, label: `All ads · last ${days} days` },
  ];
  return (
    <div>
      <label htmlFor="ad-results-pick" className="text-[0.8125rem] text-ink-soft">
        Ad
      </label>
      <SelectField
        id="ad-results-pick"
        options={options}
        value={booking?.id ?? ALL}
        onChange={setPicked}
        wrapperClassName="mt-1.5 max-w-sm"
        className={cn(
          "w-full rounded-control border border-ink-soft/65 bg-paper px-4 py-2.5 text-base text-ink",
          "transition-colors duration-300 ease-calm focus:border-accent",
        )}
      />
      {booking === undefined ? (
        <Detail tally={results.total} name="All ads" letters={false} />
      ) : (
        <Detail tally={booking} name={`${AD_PLACEMENT_LABELS[booking.placement]}, ${formatAdWeek(booking.weekStart)}`} letters />
      )}
    </div>
  );
}
