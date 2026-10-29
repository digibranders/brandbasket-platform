"use client";

import { useState, type ReactElement } from "react";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { KickoffPicker } from "@/components/first-look/kickoff-picker";
import { SOFT_BUTTON } from "@/components/v2/classes";

/** Add to calendar, and Reschedule, which opens the picker in place. The calendar file is made from the stored start and end. */
export function KickoffActions({ startsAtIso, endsAtIso, showLiveBy, bookingUrl }: { readonly startsAtIso: string | null; readonly endsAtIso: string | null; readonly showLiveBy: boolean; readonly bookingUrl: string | null }): ReactElement {
  const [changing, setChanging] = useState(false);
  return (
    <div className="grid w-full gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {startsAtIso === null || endsAtIso === null ? null : (
          <a href={callInviteHref(startsAtIso, endsAtIso)} download="brandbasket-kickoff-call.ics" className={SOFT_BUTTON}>
            Add to calendar
          </a>
        )}
        <button type="button" onClick={() => setChanging((open) => !open)} aria-expanded={changing} className={SOFT_BUTTON}>
          {changing ? "Keep this time" : "Reschedule"}
        </button>
      </div>
      {changing ? <KickoffPicker showLiveBy={showLiveBy} bookingUrl={bookingUrl} /> : null}
    </div>
  );
}
