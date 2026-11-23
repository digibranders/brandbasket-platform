import type { BookedCall } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import type { CallLine } from "@/lib/calls-view";
import { callTiming } from "@/lib/calls-today";
import { clock } from "@/lib/team-time";

interface CallsTodayProps {
  readonly calls: readonly BookedCall[];
  readonly upcoming: readonly CallLine[];
  readonly past: readonly CallLine[];
  readonly now: Date;
}

function CallLines({ lines, empty }: { readonly lines: readonly CallLine[]; readonly empty: string }): ReactElement {
  if (lines.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <ul>
      {lines.map((line) => (
        <li key={line.call.businessId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-1.5 text-[0.84375rem]">
          <Link href={`/clients/${line.call.businessId}`} className="min-w-0 truncate font-semibold text-ink hover:underline">
            {line.call.businessName}
          </Link>
          <span className="font-figure text-xs text-ink-2">{line.when}</span>
        </li>
      ))}
    </ul>
  );
}

/** The one home for calls: today's with how each stands, what is coming up and the last week's. A call that ended unanswered is a Today row. */
export function CallsToday({ calls, upcoming, past, now }: CallsTodayProps): ReactElement {
  return (
    <Section title="Calls">
      <h3 className="text-xs font-semibold text-ink-2">Today</h3>
      {calls.length === 0 ? (
        <EmptyLine>No calls booked today.</EmptyLine>
      ) : (
        <ul>
          {calls.map((call) => {
            const timing = callTiming(call.startsAt, call.endsAt, now);
            return (
              <li key={`${call.businessId}:${call.startsAt.toISOString()}`} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-[0.84375rem]">
                <span className="font-figure text-xs text-ink-2">{clock(call.startsAt)}</span>
                <Link href={`/clients/${call.businessId}`} className="min-w-0 truncate font-semibold text-ink hover:underline">
                  Kickoff · {call.businessName}
                </Link>
                <StatusPill tone={timing.tone}>{timing.label}</StatusPill>
              </li>
            );
          })}
        </ul>
      )}
      <h3 className="mt-4 text-xs font-semibold text-ink-2">Coming up</h3>
      <CallLines lines={upcoming} empty="Nothing booked in the next four weeks." />
      <h3 className="mt-4 text-xs font-semibold text-ink-2">Last 7 days</h3>
      <CallLines lines={past} empty="No calls in the last week." />
    </Section>
  );
}
