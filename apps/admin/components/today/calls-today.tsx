import type { BookedCall } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { callTiming } from "@/lib/calls-today";
import { clock } from "@/lib/team-time";

interface CallsTodayProps {
  readonly calls: readonly BookedCall[];
  readonly now: Date;
}

export function CallsToday({ calls, now }: CallsTodayProps): ReactElement {
  return (
    <Section title="Calls today">
      {calls.length === 0 ? (
        <EmptyLine>No calls booked today.</EmptyLine>
      ) : (
        <ul>
          {calls.map((call) => {
            const timing = callTiming(call.startsAt, call.endsAt, now);
            return (
              <li
                key={`${call.businessId}:${call.startsAt.toISOString()}`}
                className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-[0.84375rem]"
              >
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
    </Section>
  );
}
