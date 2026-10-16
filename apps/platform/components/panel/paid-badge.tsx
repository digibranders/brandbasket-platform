"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { ClockIcon } from "@fynix/shared/ui/icons";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { formatPaidAgo } from "@fynix/shared/lib/paid-ago";
import type { SetupCallBookingView } from "@/lib/server/setup-call";

interface PaidBadgeProps {
  /** When the first payment was confirmed. */
  readonly paidAtIso: string;
  /** The server's clock when the page was drawn, so the first browser render matches it and only then moves on. */
  readonly serverNowMs: number;
  readonly booking: SetupCallBookingView | null;
}

const TICK_MS = 30_000;

/** The browser's clock, moving on every half minute. It is read in steps of that size so the value holds still between ticks. */
function subscribeToClock(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(timer);
}

function readClock(): number {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS;
}

/**
 * A small proof that Fynix has seen the payment and is ready: how long ago it was made, counting up while the customer has not
 * booked their kickoff call. Once they have, it says so instead (with the time, when the booking page has reported it).
 */
export function PaidBadge({ paidAtIso, serverNowMs, booking }: PaidBadgeProps): ReactElement {
  // The server's own time for the first render, so the markup matches; the browser's clock after.
  const nowMs = useSyncExternalStore(subscribeToClock, readClock, () => serverNowMs);

  return (
    <p className="inline-flex items-center gap-2.5 rounded-full bg-success-pale px-4 py-2.5 text-[0.8125rem] font-medium text-success-deep">
      <ClockIcon className="size-4 shrink-0" />
      {booking === null ? (
        <span>Paid {formatPaidAgo(nowMs - new Date(paidAtIso).getTime())}</span>
      ) : booking.startsAtIso === null ? (
        <span>Call booked</span>
      ) : (
        <span>
          Call booked for <LocalDateTime iso={booking.startsAtIso} />
        </span>
      )}
    </p>
  );
}
