"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AppointmentRow } from "@fynix/db";
import { CANCEL_REASON_MAX_LENGTH } from "@fynix/shared/lib/appointments/limits";
import { slotLabel } from "@fynix/shared/lib/appointments/slots";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { Button } from "@fynix/shared/ui/panel/button";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { SelectField } from "@fynix/shared/ui/select-field";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { formatBookedAt, formatLongDate, formatRelativeTime } from "@/lib/appointments/date-format";
import type { DoctorRef } from "@/lib/appointments/doctors-view";
import { StatusLabel } from "./status-label";

interface BookingDetailsPanelProps {
  readonly appointment: AppointmentRow;
  /** The phone number laid out for reading, e.g. "+91 98200 11223" -- computed server-side (displayPhoneText,
   * @fynix/shared/server/phone-display, is "server-only" and can't run in this client component). The `tel:`
   * link below still dials `appointment.phone` itself (E.164), never this. Null for an erased booking, which has no
   * phone at all: the Phone row is left out rather than shown empty. */
  readonly phoneText: string | null;
  /** Where "Close" sends the customer back to. */
  readonly closeHref: string;
  /** Where a successful Cancel sends the customer back to -- closeHref plus the transient marker
   * CancelledRedirectFocus (mounted by the page) picks up to focus and announce the result. */
  readonly cancelledHref: string;
  readonly currentYear: number;
  readonly timeZone: string;
  /** True while booked once this slot's start time has passed -- Attended and No-show only show then (see the
   * appointments page, which computes this with the same pure `canRecordOutcome` helper, and the same `now`, that
   * the server action re-checks before actually recording either). */
  readonly canRecordOutcome: boolean;
  /** What "now" was when the page rendered -- formatRelativeTime's other half, so "Booked 2 hours ago" is
   * computed once, consistently, rather than drifting from the browser's own clock. */
  readonly now: Date;
  readonly transitionAction: PanelFormAction;
  /** The doctor this booking is with, shown as "With …", or null to show none: a one-doctor clinic never sees it
   * (see bookingDoctorName in lib/appointments/doctors-view.ts). */
  readonly doctorName: string | null;
  /** Set only for a booked, upcoming booking at a clinic with two or more active doctors: the other doctors free
   * for this exact slot (worked out server-side -- see lib/server/free-doctors.ts), possibly none. Null hides the
   * Reassign control altogether. */
  readonly reassignOptions: readonly DoctorRef[] | null;
  readonly reassignAction: PanelFormAction;
}

/** Calls `onSaved` once, the render after `saved` first turns true. Mirrors the old row-actions.tsx's own
 * useNotifyOnSaved -- kept local here since nothing else in this feature needs it any more. */
function useNotifyOnSaved(saved: boolean, onSaved: () => void): void {
  useEffect(() => {
    if (saved) onSaved();
    // Only the transition into "saved" matters here; onSaved is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
}

function CancelForm({
  appointment,
  cancelledHref,
  transitionAction,
}: {
  readonly appointment: AppointmentRow;
  readonly cancelledHref: string;
  readonly transitionAction: PanelFormAction;
}): ReactElement {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { formRef, statusRef, formAction, controls } = usePanelForm(transitionAction);
  // A successful cancel closes the panel by navigating to cancelledHref: the booking it was showing no longer
  // belongs on the grid (it moves to "Cancelled this week" instead), so there's nothing left here to look at. The
  // confirmation itself is announced from there, not here -- see CancelledRedirectFocus's own doc comment.
  useNotifyOnSaved(controls.saved, () => router.push(cancelledHref));
  const reasonId = `cancel-reason-${appointment.id}`;

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-ink">
        Cancel this booking? The slot opens up again.
      </p>
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="appointmentId" value={appointment.id} />
        <input type="hidden" name="action" value="cancel" />
        <div>
          <label htmlFor={reasonId} className="block text-[0.8125rem] font-medium text-ink-soft">
            Reason <span className="font-normal">(optional)</span>
          </label>
          <input
            id={reasonId}
            name="reason"
            type="text"
            maxLength={CANCEL_REASON_MAX_LENGTH}
            defaultValue={controls.valueOf("reason", "")}
            aria-label={`Cancel reason for ${appointment.patientName}`}
            className={FIELD_CLASSES}
            {...controls.fieldStatus("reason")}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={controls.isPending}
            aria-busy={controls.isPending}
            aria-label={`Yes, cancel booking for ${appointment.patientName}`}
          >
            {controls.isPending ? "Cancelling…" : "Yes, cancel"}
          </Button>
          <Button type="button" variant="quiet" size="sm" disabled={controls.isPending} onClick={() => setConfirming(false)}>
            Keep booking
          </Button>
          <PanelFormStatus controls={controls} statusRef={statusRef} />
        </div>
      </form>
    </div>
  );
}

/** The two ways a booking that has started can end. `done` is labelled "Attended" everywhere the clinic sees it. */
type Outcome = "done" | "no_show";

interface OutcomeCopy {
  readonly label: string;
  readonly ariaLabel: (patientName: string) => string;
  readonly variant: "primary" | "secondary";
}

const OUTCOME_COPY: Readonly<Record<Outcome, OutcomeCopy>> = {
  done: { label: "Attended", ariaLabel: (name) => `Mark ${name} attended`, variant: "primary" },
  no_show: { label: "No-show", ariaLabel: (name) => `Mark ${name} as a no-show`, variant: "secondary" },
};

/** One outcome button, as its own form so each keeps its own pending and error state. */
function OutcomeForm({
  appointment,
  outcome,
  transitionAction,
}: {
  readonly appointment: AppointmentRow;
  readonly outcome: Outcome;
  readonly transitionAction: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(transitionAction);
  const copy = OUTCOME_COPY[outcome];
  // No "saved" callback here: a successful save revalidates the page, and the new status arrives in the same render
  // as the action's result, so this form unmounts before a saved-effect could ever run. BookingDetailsPanel announces
  // the outcome from the status change itself instead.

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <input type="hidden" name="action" value={outcome} />
      <Button
        type="submit"
        variant={copy.variant}
        size="sm"
        disabled={controls.isPending}
        aria-busy={controls.isPending}
        aria-label={copy.ariaLabel(appointment.patientName)}
      >
        {controls.isPending ? "Saving…" : copy.label}
      </Button>
      <PanelFormStatus controls={controls} statusRef={statusRef} />
    </form>
  );
}

/** FIELD_CLASSES' look for the dropdown's trigger, sized to its content and sitting inline beside its button rather
 * than full-width under a label -- spelled out rather than appended to FIELD_CLASSES, since `cn` only joins classes
 * and a trailing `w-auto` would not reliably beat the `w-full` already in it. The trigger is a flex button, so
 * there is no `block` either. */
const SELECT_TRIGGER_CLASSES =
  "w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent aria-[invalid=true]:border-accent-deep";

/**
 * Moves the booking to another doctor. The dropdown offers only the doctors the page found free for this slot; the
 * action re-checks whichever one is submitted anyway, since the list is only as fresh as the page. On success the
 * page revalidates and this panel -- same booking id, so it stays mounted -- redraws with the new doctor's name
 * and a fresh list (now including the doctor it just left, if they're still free).
 */
function ReassignForm({
  appointment,
  options,
  reassignAction,
}: {
  readonly appointment: AppointmentRow;
  readonly options: readonly DoctorRef[];
  readonly reassignAction: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(reassignAction);
  const selectId = `reassign-${appointment.id}`;
  const startDoctor = controls.valueOf("practitionerId", options[0]?.id ?? "");

  if (options.length === 0) {
    return <p className="text-sm text-ink-soft">No other doctor is free then.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <label htmlFor={selectId} className="block text-[0.8125rem] font-medium text-ink-soft">
        Reassign to <RequiredMark />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          // Remount when the offered doctors change (after a reassign, say), so the dropdown's default resets to the
          // new list's first doctor rather than keeping a choice that may no longer be offered. The starting choice
          // is part of the key too: React resets the form once the action settles, and a dropdown only honours its
          // defaultValue on mount, so a refused move redraws it on the doctor that was picked.
          key={`${options.map((option) => option.id).join(",")}|${startDoctor}`}
          id={selectId}
          name="practitionerId"
          options={options.map((option) => ({ value: option.id, label: option.name }))}
          defaultValue={startDoctor}
          required
          className={SELECT_TRIGGER_CLASSES}
          wrapperClassName="min-w-48"
          {...controls.fieldStatus("practitionerId")}
        />
        <SubmitButton
          variant="secondary"
          size="sm"
          disabled={controls.isPending}
          pendingLabel="Moving…"
          aria-label={`Reassign booking for ${appointment.patientName}`}
        >
          Reassign
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}

/** What the announcement line says once an outcome is recorded. */
const OUTCOME_ANNOUNCEMENTS: Readonly<Record<Outcome, string>> = { done: "Marked attended.", no_show: "Marked no-show." };

function isOutcome(status: AppointmentRow["status"]): status is Outcome {
  return status === "done" || status === "no_show";
}

/**
 * What clicking a booking opens: everything about that one booking, and what a clinic can do with it. Cancel only
 * shows while it's still booked (and asks for a confirm first -- see CancelForm); Attended and No-show only once
 * it's both booked and its slot has started (`canRecordOutcome`).
 *
 * The patient's name links to their record in Patients while the booking is linked to one; an erased booking
 * ("Deleted patient") has no record, no phone and no link.
 *
 * The page renders this keyed on `appointment.id` (see app/app-host/(protected)/appointments/page.tsx), so opening
 * a *different* booking while this one is showing remounts it fresh -- resetting the cancel-confirm step and the
 * announcement below -- while Attended and No-show, which keep the same id, correctly stay mounted through their
 * own status change so the "keep the panel open, show the new status" behaviour actually has something to update
 * in place.
 */
export function BookingDetailsPanel({
  appointment,
  phoneText,
  closeHref,
  cancelledHref,
  currentYear,
  timeZone,
  canRecordOutcome,
  now,
  transitionAction,
  doctorName,
  reassignOptions,
  reassignAction,
}: BookingDetailsPanelProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // "When it opens, focus its heading and scroll it into view" -- fires once per distinct booking, since a
  // different id remounts this component (see the doc comment above).
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  // Attended / No-show are announced from the status change, not from the button's own form: the revalidated
  // booking and the action's result land in one render, which unmounts the buttons before any saved-effect of theirs
  // could run. Tracked as state adjusted during render (React's "storing information from previous renders"
  // pattern) so a booked -> outcome change is caught on exactly the render it arrives in.
  const [lastStatus, setLastStatus] = useState(appointment.status);
  if (appointment.status !== lastStatus) {
    setLastStatus(appointment.status);
    if (lastStatus === "booked" && isOutcome(appointment.status)) setAnnouncement(OUTCOME_ANNOUNCEMENTS[appointment.status]);
  }

  // The buttons that had focus are gone once an outcome is recorded; hand focus back to the heading so it never
  // falls to the document body.
  useEffect(() => {
    if (announcement !== "") headingRef.current?.focus();
  }, [announcement]);

  return (
    <section aria-labelledby="booking-panel-heading" className="mt-8 border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* The link sits inside the heading, so the heading keeps its focus-on-open behaviour and its name, and
              the link is the next tab stop after it. */}
          <h2 id="booking-panel-heading" ref={headingRef} tabIndex={-1} className="panel-section outline-none">
            {appointment.patientId === null ? (
              appointment.patientName
            ) : (
              <Link href={`/patients/${appointment.patientId}`} className="link-underline">
                {appointment.patientName}
              </Link>
            )}
          </h2>
          <p className="mt-1 text-sm tabular-nums text-ink-soft">
            {formatLongDate(appointment.localDate, currentYear)}, {slotLabel(appointment.localStart, appointment.localEnd)}
          </p>
          {doctorName === null ? null : <p className="mt-0.5 text-sm text-ink">With {doctorName}</p>}
        </div>
        <Link href={closeHref} className="link-underline text-sm text-ink-soft">
          Close
        </Link>
      </div>

      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink">
        {announcement}
      </p>

      <dl className="mt-2 space-y-1 text-[0.9375rem]">
        {appointment.phone === null ? null : (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Phone</dt>
            <dd>
              <a href={`tel:${appointment.phone}`} className="link-underline text-ink">
                <span className="tabular-nums">{phoneText ?? appointment.phone}</span>
              </a>
            </dd>
          </div>
        )}
        {appointment.email === null ? null : (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Email</dt>
            <dd>
              <a href={`mailto:${appointment.email}`} className="link-underline text-ink">
                {appointment.email}
              </a>
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-soft">Service</dt>
          <dd className="text-ink">{appointment.serviceName ?? "Any service"}</dd>
        </div>
      </dl>

      {appointment.patientNote === null ? null : <p className="mt-3 text-sm text-ink-soft">“{appointment.patientNote}”</p>}

      <StatusLabel status={appointment.status} className="mt-4" />
      <p className="mt-1.5 text-[0.8125rem] text-ink-soft">
        Booked{" "}
        <time dateTime={appointment.createdAt.toISOString()} title={formatBookedAt(appointment.createdAt, timeZone, currentYear)}>
          {formatRelativeTime(appointment.createdAt, now)}
        </time>
        {appointment.source === "clinic" ? " · Added by the clinic" : null}
      </p>
      {appointment.cancelReason === null ? null : <p className="mt-2 text-sm text-ink-soft">Cancelled: {appointment.cancelReason}</p>}

      {appointment.status === "booked" ? (
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
          {canRecordOutcome ? (
            <>
              <OutcomeForm appointment={appointment} outcome="done" transitionAction={transitionAction} />
              <OutcomeForm appointment={appointment} outcome="no_show" transitionAction={transitionAction} />
            </>
          ) : null}
          <CancelForm appointment={appointment} cancelledHref={cancelledHref} transitionAction={transitionAction} />
        </div>
      ) : null}

      {appointment.status === "booked" && reassignOptions !== null ? (
        <div className="mt-5">
          <ReassignForm appointment={appointment} options={reassignOptions} reassignAction={reassignAction} />
        </div>
      ) : null}
    </section>
  );
}
