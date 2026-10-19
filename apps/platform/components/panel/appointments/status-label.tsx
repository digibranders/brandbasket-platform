import type { ReactElement } from "react";
import type { AppointmentRow } from "@brandbasket/db";
import { APPOINTMENT_STATUS_LABELS } from "@brandbasket/shared/lib/appointments/status";
import { cn } from "@brandbasket/shared/lib/cn";

type Status = AppointmentRow["status"];

/**
 * A booking's status as one sentence-case word with a small mark before it: the one way every clinic screen shows
 * it (apps/platform/DESIGN.md, "Status labels"). Replaces the old tiny uppercase, letter-spaced labels, which were
 * the slowest thing on the page to read at a glance, and the faded 60% "cancelled" text, which fell below 4.5:1.
 *
 * The word always carries the meaning; the mark only reinforces it, so nothing depends on colour alone. Filled
 * marks are states that still matter (booked, attended); hollow ones are states that ended without a visit
 * (no-show, cancelled). Every text colour here is at least 8:1 on paper; gold-deep is used only for the no-show
 * ring, a non-text mark, where 3:1 is the bar and it clears it.
 */
const MARK_CLASSES: Readonly<Record<Status, string>> = {
  booked: "bg-accent",
  done: "bg-ink-soft",
  no_show: "border-[1.5px] border-gold-deep",
  cancelled: "border-[1.5px] border-ink-soft",
};

const TEXT_CLASSES: Readonly<Record<Status, string>> = {
  booked: "text-accent",
  done: "text-ink-soft",
  no_show: "text-ink",
  cancelled: "text-ink-soft",
};

interface StatusLabelProps {
  readonly status: Status;
  /** Shows a "New" tag before the status: a booking the clinic hasn't opened yet. */
  readonly isNew?: boolean;
  readonly className?: string;
}

export function StatusLabel({ status, isNew = false, className }: StatusLabelProps): ReactElement {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-[0.8125rem] font-medium", TEXT_CLASSES[status], className)}>
      {isNew ? <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-semibold text-paper">New</span> : null}
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", MARK_CLASSES[status])} />
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
