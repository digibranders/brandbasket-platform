"use client";

import type { ClosureRow } from "@firstfold/db";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { CLOSURE_NOTE_MAX_LENGTH } from "@firstfold/shared/lib/business-facts/closures";
import { formatStoredDate } from "@firstfold/shared/lib/format";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { BookingClashList } from "@/components/panel/appointments/booking-clash-list";
import {
  FIELD_CLASSES,
  MAX_DATE,
  PanelFormStatus,
  usePanelForm,
  type PanelFormAction,
} from "@/components/panel/form/panel-form";

interface ClosuresPanelProps {
  /** Upcoming closures only (packages/shared's upcomingClosures), soonest first. */
  readonly closures: readonly ClosureRow[];
  /** Today's date where the business is (YYYY-MM-DD): the earliest last day the server will accept. */
  readonly today: string;
  readonly addAction: PanelFormAction;
  readonly deleteAction: PanelFormAction;
  /*
   * The rest are for reusing this panel for something with the same shape as a clinic closure -- a doctor's leave
   * on the Doctors page. Each defaults to exactly what Your details has always rendered, so that page passes none.
   */
  /** The section heading. Defaults to "Closures". */
  readonly heading?: string;
  /** What one row is called in its Remove button's label ("Remove closure 3 October 2026"). Defaults to "closure". */
  readonly itemNoun?: string;
  /** The hidden field naming the row a Remove button removes. Defaults to "closureId". */
  readonly idField?: string;
  /** Prefix for the add form's input ids. Defaults to "closure". */
  readonly idPrefix?: string;
  readonly notePlaceholder?: string;
  /** Extra hidden fields sent with the add form, e.g. which doctor the leave is for. */
  readonly addFields?: Readonly<Record<string, string>>;
  /** Offers "different hours" (a half day) beside "closed all day", and says "Reason" for the note. Off for a doctor's leave. */
  readonly withHours?: boolean;
}

/** "10:00" -> "10 am", "14:30" -> "2:30 pm". */
function clockLabel(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? "am" : "pm";
  return minutes === 0 ? `${twelve} ${suffix}` : `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** What the business does on these days: "Closed all day", or "Open 10 am – 2 pm" for a half day. */
function closureHours(closure: ClosureRow): string {
  return typeof closure.opensAt === "string" && typeof closure.closesAt === "string"
    ? `Open ${clockLabel(closure.opensAt)} – ${clockLabel(closure.closesAt)}`
    : "Closed all day";
}

/** "3 October 2026" for a single day, "3–5 October 2026" for a range. */
function closureRange(closure: ClosureRow): string {
  if (closure.startsOn === closure.endsOn) return formatStoredDate(closure.startsOn);
  return `${formatStoredDate(closure.startsOn)} – ${formatStoredDate(closure.endsOn)}`;
}

function ClosureItem({
  closure,
  deleteAction,
  idField,
  itemNoun,
  withHours,
  onRemoved,
}: {
  readonly closure: ClosureRow;
  readonly deleteAction: PanelFormAction;
  readonly idField: string;
  readonly itemNoun: string;
  readonly withHours: boolean;
  /** Called once the removal goes through, so the list above can move focus somewhere that will still exist. */
  readonly onRemoved: () => void;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(deleteAction);

  useEffect(() => {
    if (controls.saved) onRemoved();
    // Only the transition into "saved" matters here; onRemoved is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.saved]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium tabular-nums">{closureRange(closure)}</p>
        {closure.note === null ? null : <p className="mt-0.5 text-sm text-ink-soft">{closure.note}</p>}
        {withHours ? <p className="mt-0.5 text-sm text-ink-soft">{closureHours(closure)}</p> : null}
      </div>
      <form ref={formRef} action={formAction} className="flex items-center gap-3">
        <input type="hidden" name={idField} value={closure.id} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={controls.isPending}
          aria-busy={controls.isPending}
          aria-label={`Remove ${itemNoun} ${closureRange(closure)}`}
        >
          {controls.isPending ? "Removing…" : "Remove"}
        </Button>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </form>
    </li>
  );
}

/** Holiday and one-off closures beyond the business's usual hours: an add form, then the upcoming ones. Owns its
 * own "Closures" heading (rather than the page rendering it) so a removed row can hand focus to something that
 * will still be there once the row itself disappears from the list. */
export function ClosuresPanel({
  closures,
  today,
  addAction,
  deleteAction,
  heading = "Closures",
  itemNoun = "closure",
  idField = "closureId",
  idPrefix = "closure",
  notePlaceholder = "Diwali",
  addFields = {},
  withHours = false,
}: ClosuresPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(addAction);
  const [kind, setKind] = useState<"closed" | "hours">("closed");
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <div className="space-y-6">
      <h2 ref={headingRef} tabIndex={-1} className="panel-section outline-none">
        {heading}
      </h2>

      <form ref={formRef} action={formAction} className="space-y-4">
        {Object.entries(addFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${idPrefix}-startsOn`} className="block text-sm font-medium">
              First day
              <RequiredMark />
            </label>
            <input
              id={`${idPrefix}-startsOn`}
              name="startsOn"
              type="date"
              max={MAX_DATE}
              required
              defaultValue={controls.valueOf("startsOn", "")}
              className={FIELD_CLASSES}
              {...controls.fieldStatus("startsOn")}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-endsOn`} className="block text-sm font-medium">
              Last day
              <RequiredMark />
            </label>
            <input
              id={`${idPrefix}-endsOn`}
              name="endsOn"
              type="date"
              min={today}
              max={MAX_DATE}
              required
              defaultValue={controls.valueOf("endsOn", "")}
              className={FIELD_CLASSES}
              {...controls.fieldStatus("endsOn")}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-note`} className="block text-sm font-medium">
              {withHours ? "Reason" : "Note"} <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id={`${idPrefix}-note`}
              name="note"
              type="text"
              maxLength={CLOSURE_NOTE_MAX_LENGTH}
              placeholder={notePlaceholder}
              defaultValue={controls.valueOf("note", "")}
              className={FIELD_CLASSES}
              {...controls.fieldStatus("note")}
            />
          </div>
        </div>
        {withHours ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">On these days</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="kind" value="closed" checked={kind === "closed"} onChange={() => setKind("closed")} />
                Closed all day
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="kind" value="hours" checked={kind === "hours"} onChange={() => setKind("hours")} />
                Different hours, such as a half day
              </label>
            </div>
            {kind === "hours" ? (
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${idPrefix}-opensAt`} className="block text-sm font-medium">
                    Opens
                    <RequiredMark />
                  </label>
                  <input
                    id={`${idPrefix}-opensAt`}
                    name="opensAt"
                    type="time"
                    required
                    defaultValue={controls.valueOf("opensAt", "")}
                    className={FIELD_CLASSES}
                    {...controls.fieldStatus("opensAt")}
                  />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-closesAt`} className="block text-sm font-medium">
                    Closes
                    <RequiredMark />
                  </label>
                  <input
                    id={`${idPrefix}-closesAt`}
                    name="closesAt"
                    type="time"
                    required
                    defaultValue={controls.valueOf("closesAt", "")}
                    className={FIELD_CLASSES}
                    {...controls.fieldStatus("closesAt")}
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
        ) : null}
        <div className="flex items-center gap-4">
          <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Adding…">
            Add
          </SubmitButton>
          <PanelFormStatus controls={controls} statusRef={statusRef} />
        </div>
      </form>

      <BookingClashList controls={controls} noun={itemNoun} />

      {closures.length === 0 ? null : (
        <ul className="divide-y divide-line border-t border-line">
          {closures.map((closure) => (
            <ClosureItem
              key={closure.id}
              closure={closure}
              deleteAction={deleteAction}
              idField={idField}
              itemNoun={itemNoun}
              withHours={withHours}
              onRemoved={() => headingRef.current?.focus()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
