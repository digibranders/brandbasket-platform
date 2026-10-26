"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactElement } from "react";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { slotLabel } from "@/lib/call-dates";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { KickoffPicker } from "./kickoff-picker";

interface BookedLineProps {
  readonly startsAtIso: string | null;
  readonly endsAtIso: string | null;
  readonly showLiveBy: boolean;
  readonly bookingUrl: string | null;
}

/** "Kickoff call booked", its time, Add to calendar and Change. Change opens the picker in place. */
export function BookedLine({ startsAtIso, endsAtIso, showLiveBy, bookingUrl }: BookedLineProps): ReactElement {
  const [changing, setChanging] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle size={22} weight="fill" aria-hidden="true" className="text-sage" />
        <p className="min-w-0 flex-1">
          <b className="block text-sm font-semibold text-ink">Kickoff call booked</b>
          <span className="block font-figure text-[0.8125rem] text-ink-2">{startsAtIso === null ? "The time is in your confirmation email" : slotLabel(startsAtIso)}</span>
        </p>
        <span className="flex gap-2 max-sm:w-full max-sm:pl-[2.125rem]">
          {startsAtIso === null || endsAtIso === null ? null : (
            <a href={callInviteHref(startsAtIso, endsAtIso)} download="brandbasket-kickoff-call.ics" className={SOFT_BUTTON}>
              Add to calendar
            </a>
          )}
          <button type="button" onClick={() => setChanging((open) => !open)} aria-expanded={changing} className={SOFT_BUTTON}>
            {changing ? "Keep this time" : "Change"}
          </button>
        </span>
      </div>
      {changing ? <KickoffPicker showLiveBy={showLiveBy} bookingUrl={bookingUrl} /> : null}
    </div>
  );
}
