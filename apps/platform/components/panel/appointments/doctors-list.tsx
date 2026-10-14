"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { practitionerInitials } from "@firstfold/shared/lib/appointments/initials";
import { PRACTITIONER_NAME_MAX_LENGTH, PRACTITIONER_TITLE_MAX_LENGTH } from "@firstfold/shared/lib/appointments/practitioner-form";
import { cn } from "@firstfold/shared/lib/cn";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import {
  FIELD_CLASSES,
  PanelFormGroup,
  PanelFormStatus,
  usePanelForm,
  type PanelFormAction,
  type PanelFormControls,
} from "@/components/panel/form/panel-form";

/** One active doctor as the list shows them: plain fields only, so the page can hand them straight across from
 * the server. */
export interface DoctorSummary {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly usesClinicHours: boolean;
}

interface DoctorsListProps {
  /** Active doctors, in display order. */
  readonly doctors: readonly DoctorSummary[];
  /** The doctor whose editor is open (the page's `?doctor=` param), or null. */
  readonly openId: string | null;
  /** That doctor's editor, rendered right under their row so it opens in place, on a phone as much as a desk. */
  readonly editor: ReactNode;
  readonly addAction: PanelFormAction;
  readonly moveAction: PanelFormAction;
  readonly archiveAction: PanelFormAction;
}

const DOCTORS_PATH = "/appointments/doctors";

/** True when nothing on the page has focus any more -- what happens when the focused control is removed from the
 * DOM or disabled under the pointer -- so focus management only steps in when focus was actually lost. */
function focusWasLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/** The round initials avatar that stands in for a photo. Decorative: the name sits right beside it. */
export function DoctorAvatar({ name }: { readonly name: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-pale text-sm font-medium text-accent-deep"
    >
      {practitionerInitials(name)}
    </span>
  );
}

function AddDoctorForm({ addAction }: { readonly addAction: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(addAction);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <h2 className="panel-section">Add a doctor</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-doctor-name" className="block text-sm font-medium">
            Name <RequiredMark />
          </label>
          <RuleInput
            rule="personName"
            id="new-doctor-name"
            name="name"
            required
            autoComplete="off"
            maxLength={PRACTITIONER_NAME_MAX_LENGTH}
            placeholder="Dr Meera Iyer"
            defaultValue={controls.valueOf("name", "")}
            className={FIELD_CLASSES}
            {...controls.fieldStatus("name")}
          />
        </div>
        <div>
          <label htmlFor="new-doctor-title" className="block text-sm font-medium">
            Title <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id="new-doctor-title"
            name="title"
            type="text"
            autoComplete="off"
            maxLength={PRACTITIONER_TITLE_MAX_LENGTH}
            placeholder="Physiotherapist"
            defaultValue={controls.valueOf("title", "")}
            className={FIELD_CLASSES}
            {...controls.fieldStatus("title")}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Adding…">
          Add
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}

/** The quiet arrow-button look for moving a doctor up or down. */
const ARROW_CLASSES =
  "flex size-8 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:bg-ink/[0.05] hover:text-ink disabled:pointer-events-none disabled:opacity-30";

function DoctorRow({
  doctor,
  index,
  isFirst,
  isLast,
  isOpen,
  editor,
  moveAction,
  archiveAction,
}: {
  readonly doctor: DoctorSummary;
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isOpen: boolean;
  readonly editor: ReactNode;
  readonly moveAction: PanelFormAction;
  readonly archiveAction: PanelFormAction;
}): ReactElement {
  const { formRef: moveFormRef, statusRef: moveStatusRef, formAction: moveFormAction, controls: moveControls } =
    usePanelForm(moveAction);
  const { formRef: archiveFormRef, statusRef: archiveStatusRef, formAction: archiveFormAction, controls: archiveControls } =
    usePanelForm(archiveAction);
  const busy = moveControls.isPending || archiveControls.isPending;
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  /** The arrow last pressed, so focus can be put back once the move settles: both arrows are disabled while it is
   * pending, and the pressed one stays disabled if the row has reached that edge. */
  const pressedArrow = useRef<"up" | "down" | null>(null);

  useEffect(() => {
    if (moveControls.isPending || pressedArrow.current === null) return;
    const pressed = pressedArrow.current === "up" ? upRef.current : downRef.current;
    const other = pressedArrow.current === "up" ? downRef.current : upRef.current;
    pressedArrow.current = null;
    if (!focusWasLost()) return;
    const target = pressed !== null && !pressed.disabled ? pressed : other;
    target?.focus();
  }, [moveControls.isPending, index]);

  // A refused archive (upcoming bookings, or the last doctor) leaves the row in place, but its Archive button was
  // disabled while the request ran, which drops focus; put it back so the refusal just announced reads in context.
  // A successful archive unmounts the row instead, and DoctorsList moves focus on.
  const archiveWasPending = useRef(false);
  useEffect(() => {
    if (archiveControls.isPending) {
      archiveWasPending.current = true;
      return;
    }
    if (!archiveWasPending.current) return;
    archiveWasPending.current = false;
    if (focusWasLost()) archiveFormRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [archiveControls.isPending, archiveFormRef]);
  // A move or an archive shows itself -- the row moves, or leaves the list -- so neither says "Saved." as well.
  const moveStatus: PanelFormControls = { ...moveControls, saved: false };
  const archiveStatus: PanelFormControls = { ...archiveControls, saved: false };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
          <DoctorAvatar name={doctor.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{doctor.name}</p>
            <p className="truncate text-sm text-ink-soft">
              {doctor.title === null ? null : <span>{doctor.title} · </span>}
              {doctor.usesClinicHours ? "Clinic hours" : "Own hours"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 pl-13 sm:pl-0">
          {/* One form, two submit buttons: React sends the clicked button's own name/value, so `direction` says
              which arrow it was. */}
          <form ref={moveFormRef} action={moveFormAction} className="flex items-center">
            <input type="hidden" name="practitionerId" value={doctor.id} />
            <button
              ref={upRef}
              type="submit"
              name="direction"
              value="up"
              onClick={() => {
                pressedArrow.current = "up";
              }}
              disabled={isFirst || busy}
              aria-label={`Move ${doctor.name} up`}
              className={ARROW_CLASSES}
            >
              ↑
            </button>
            <button
              ref={downRef}
              type="submit"
              name="direction"
              value="down"
              onClick={() => {
                pressedArrow.current = "down";
              }}
              disabled={isLast || busy}
              aria-label={`Move ${doctor.name} down`}
              className={ARROW_CLASSES}
            >
              ↓
            </button>
          </form>

          <Link
            href={isOpen ? DOCTORS_PATH : `${DOCTORS_PATH}?doctor=${encodeURIComponent(doctor.id)}`}
            scroll={false}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Close" : "Edit"} ${doctor.name}`}
            // Where focus lands when a neighbouring row is archived (see DoctorsList).
            data-doctor-row-focus=""
            className="link-underline ml-3 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            {isOpen ? "Close" : "Edit"}
          </Link>

          <form ref={archiveFormRef} action={archiveFormAction} className="ml-2">
            <input type="hidden" name="practitionerId" value={doctor.id} />
            <Button
              type="submit"
              variant="quiet"
              size="sm"
              disabled={busy}
              aria-busy={archiveControls.isPending}
              aria-label={`Archive ${doctor.name}`}
            >
              {archiveControls.isPending ? "Archiving…" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

      {/* Both forms' messages sit on a line of their own, since an archive refusal is a whole sentence. They stay
          mounted (visually hidden while empty) so each live region is announced reliably. */}
      <div className={cn("mt-2 pl-13", moveStatus.errorMessage === null && "sr-only")}>
        <PanelFormStatus controls={moveStatus} statusRef={moveStatusRef} />
      </div>
      <div className={cn("mt-2 pl-13", archiveStatus.errorMessage === null && "sr-only")}>
        <PanelFormStatus controls={archiveStatus} statusRef={archiveStatusRef} />
      </div>

      {isOpen ? <div className="mt-6 sm:pl-13">{editor}</div> : null}
    </li>
  );
}

/** The clinic's doctors in the order the website lists them: move one up or down, open one to edit it, archive
 * one who has left. Then the form for adding another. */
export function DoctorsList({ doctors, openId, editor, addAction, moveAction, archiveAction }: DoctorsListProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);
  const previousIds = useRef<readonly string[]>(doctors.map((doctor) => doctor.id));

  // An archived doctor's row leaves the list, taking the focused Archive button with it. Focus then goes to the row
  // that took its place (or the one above, when it was last), and to the list itself if none is left.
  useEffect(() => {
    const ids = doctors.map((doctor) => doctor.id);
    const removedIndex = previousIds.current.findIndex((id) => !ids.includes(id));
    previousIds.current = ids;
    if (removedIndex === -1 || !focusWasLost()) return;
    const targets = listRef.current?.querySelectorAll<HTMLElement>("[data-doctor-row-focus]");
    const target = targets?.[Math.min(removedIndex, targets.length - 1)] ?? listRef.current;
    target?.focus();
  }, [doctors]);

  return (
    <PanelFormGroup>
      {/* One group, so only the form submitted last says "Saved." -- see PanelFormGroup. The open doctor's editor
          renders inside it, so its three forms take part too. */}
      <div className="space-y-10">
        <ul ref={listRef} tabIndex={-1} aria-label="Doctors" className="divide-y divide-line border-y border-line outline-none">
          {doctors.map((doctor, index) => (
            <DoctorRow
              key={doctor.id}
              doctor={doctor}
              index={index}
              isFirst={index === 0}
              isLast={index === doctors.length - 1}
              isOpen={doctor.id === openId}
              editor={doctor.id === openId ? editor : null}
              moveAction={moveAction}
              archiveAction={archiveAction}
            />
          ))}
        </ul>

        <AddDoctorForm addAction={addAction} />
      </div>
    </PanelFormGroup>
  );
}
