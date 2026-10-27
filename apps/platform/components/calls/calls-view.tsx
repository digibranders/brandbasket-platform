import type { ReactElement } from "react";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { BookCallButton } from "@/components/calls/book-call-button";
import { CancelCallButton } from "@/components/calls/cancel-call-button";
import { SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
import type { BookCallOptions } from "@/lib/calls/form";
import type { CallRow } from "@/lib/calls/rows";

interface CallsViewProps extends BookCallOptions {
  readonly upcoming: readonly CallRow[];
  readonly past: readonly CallRow[];
}

/** "Brandbasket call" or, for the first one, "Brandbasket kickoff call" (the name on the calendar event). */
const eventTitle = (row: CallRow): string => (row.key === "kickoff" ? "Brandbasket kickoff call" : "Brandbasket call");

function UpcomingRow({ row, options, bookingUrl, canBook }: { readonly row: CallRow } & BookCallOptions): ReactElement {
  return (
    <li className="grid items-center gap-3 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <span className="min-w-0">
        <span className="block font-figure text-[0.84375rem] font-semibold tabular-nums text-ink">{row.when}</span>
        <span className="block text-xs text-ink-2">{row.about}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <a href={callInviteHref(row.startsAtIso, row.endsAtIso, eventTitle(row))} download="brandbasket-call.ics" className={SOFT_BUTTON}>
          Add to calendar
        </a>
        {row.callId !== null && row.canChange ? (
          <BookCallButton
            options={options}
            bookingUrl={bookingUrl}
            canBook={canBook}
            label="Change"
            {...(row.reason === null ? {} : { defaultReason: row.reason })}
            {...(row.note === null ? {} : { defaultNote: row.note })}
            replacing={{ id: row.callId, when: row.when }}
          />
        ) : null}
        {row.callId !== null && row.canCancel ? <CancelCallButton callId={row.callId} /> : null}
      </span>
    </li>
  );
}

/** The Calls page (plan 28 section 7): the calls still to come with Change and Cancel, and the past ones with what was agreed. */
export function CallsView({ upcoming, past, options, bookingUrl, canBook }: CallsViewProps): ReactElement {
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Calls</h1>
          <p className="mt-2 text-[0.84375rem] text-ink-2">What we agreed on each call.</p>
        </div>
        <BookCallButton options={options} bookingUrl={bookingUrl} canBook={canBook} />
      </header>
      {upcoming.length === 0 && past.length === 0 ? <p className="text-sm text-ink-2">No calls yet. Book one when you want to talk something through.</p> : null}
      {upcoming.length === 0 ? null : (
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className={SECTION_TITLE}>
            Coming up
          </h2>
          <ul>
            {upcoming.map((row) => (
              <UpcomingRow key={row.key} row={row} options={options} bookingUrl={bookingUrl} canBook={canBook} />
            ))}
          </ul>
        </section>
      )}
      {past.length === 0 ? null : (
        <section aria-labelledby="past-title">
          <h2 id="past-title" className={SECTION_TITLE}>
            Past calls
          </h2>
          <ul>
            {past.map((row) => (
              <li key={row.key} className="grid gap-1 border-b border-line py-3 text-[0.84375rem] last:border-b-0 sm:grid-cols-[10rem_9rem_minmax(0,1fr)] sm:gap-4">
                <span className="font-figure tabular-nums text-ink">{row.when}</span>
                <span className="text-ink">{row.about}</span>
                <span className="text-ink-2">{row.agreed ?? "We will add what we agreed here."}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
