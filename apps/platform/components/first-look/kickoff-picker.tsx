"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { bookCallSlot } from "@/app/app-host/(protected)/setup-call-actions";
import { SlotPicker } from "@/components/calls/slot-picker";
import { BRAND_TIME_ZONE, promiseDates, shortDay } from "@/lib/call-dates";

interface KickoffPickerProps {
  /** Say when the website can be live with the picked time: only for a plan with the website. */
  readonly showLiveBy: boolean;
  /** The booking page staff set in the console, offered when the times cannot be listed here. */
  readonly bookingUrl: string | null;
}

/** The kickoff call's picker: the shared day-and-time picker, and when the website can be live with the picked time. */
export function KickoffPicker({ showLiveBy, bookingUrl }: KickoffPickerProps): ReactElement {
  const router = useRouter();
  return (
    <SlotPicker
      bookingUrl={bookingUrl}
      book={(slot) => bookCallSlot(slot, BRAND_TIME_ZONE)}
      onBooked={() => router.refresh()}
      note={(slot) =>
        showLiveBy && slot !== null ? (
          <p className="text-[0.8125rem] text-ink-2">
            With this time, your website can be live by <b className="font-semibold text-ink">{shortDay(promiseDates(slot).liveBy)}</b>.
          </p>
        ) : null
      }
    />
  );
}
