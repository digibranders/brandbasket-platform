import { PhoneCall } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { BookCallButton } from "@/components/calls/book-call-button";
import { CancelCallButton } from "@/components/calls/cancel-call-button";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageFrame, PageSection } from "@/components/v2/page";
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
    <PageFrame title="Calls" lede="What we agreed on each call." action={<BookCallButton options={options} bookingUrl={bookingUrl} canBook={canBook} />}>
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No calls yet"
          text="Book one when you want to talk something through, and what we agree is written here afterwards."
          action={<BookCallButton options={options} bookingUrl={bookingUrl} canBook={canBook} look="primary" />}
        />
      ) : null}
      {upcoming.length === 0 ? null : (
        <PageSection id="upcoming" title="Coming up" flush>
          <ul>
            {upcoming.map((row) => (
              <UpcomingRow key={row.key} row={row} options={options} bookingUrl={bookingUrl} canBook={canBook} />
            ))}
          </ul>
        </PageSection>
      )}
      {past.length === 0 ? null : (
        <PageSection id="past" title="Past calls" flush>
          <ul>
            {past.map((row) => (
              <li key={row.key} className="grid gap-1 border-b border-line py-3 text-[0.84375rem] last:border-b-0 sm:grid-cols-[10rem_9rem_minmax(0,1fr)] sm:gap-4">
                <span className="font-figure tabular-nums text-ink">{row.when}</span>
                <span className="text-ink">{row.about}</span>
                <span className="text-ink-2">{row.agreed ?? "We will add what we agreed here."}</span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
    </PageFrame>
  );
}
