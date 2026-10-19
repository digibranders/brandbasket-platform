"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { slotLabel } from "@brandbasket/shared/lib/appointments/slots";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import type { PanelFormControls } from "@/components/panel/form/panel-form";
import { leaveClashesOf } from "@/lib/appointments/leave-added-state";

/**
 * The bookings a just-added closure or doctor's leave falls on, each linking to that booking on its own day, so the
 * clinic can reassign or cancel it and ring the patient. Shown only once the save has gone through, and nothing when
 * it clashes with nothing. `noun` is what was added ("closure" or "leave"). Both still save over existing bookings:
 * nothing is cancelled and no patient is told, which the list says plainly rather than leaving the clinic to assume.
 */
export function BookingClashList({ controls, noun }: { readonly controls: PanelFormControls; readonly noun: string }): ReactElement | null {
  const clashes = controls.saved ? leaveClashesOf(controls.state) : [];
  if (clashes.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-accent-deep">These bookings fall on this {noun}:</p>
      <ul className="space-y-1.5">
        {clashes.map((clash) => (
          <li key={clash.appointmentId} className="text-sm">
            <Link
              href={`/appointments?${new URLSearchParams({ view: "today", day: clash.localDate, booking: clash.appointmentId }).toString()}`}
              className="link-underline"
            >
              {clash.patientName}
            </Link>
            <span className="tabular-nums text-ink-soft">
              {" "}
              · {formatStoredDate(clash.localDate)} · {slotLabel(clash.localStart, clash.localEnd)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">They are still booked and your patients have not been told. Open each one to reassign or cancel it, and ring the patient.</p>
    </div>
  );
}
