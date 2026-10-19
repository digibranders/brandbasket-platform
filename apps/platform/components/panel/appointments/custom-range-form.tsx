import type { ReactElement } from "react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";

interface CustomRangeFormProps {
  readonly from: string;
  readonly to: string;
  readonly rangeError: string | null;
  /** The doctor filter in force, carried through as a hidden field so applying a new range keeps it. */
  readonly doctor: string | null;
}

/** The last calendar date @brandbasket/shared's isIsoDate accepts -- mirrors components/panel/form/panel-form.tsx's
 * own MAX_DATE, kept as a local literal rather than imported: that module is a client component, and this form is
 * plain, server-rendered HTML (a GET form navigates on its own; no server action, no client JS needed here). */
const MAX_DATE = "2100-12-31";

const FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent";

/**
 * The Custom view's own filter: a plain GET form (no client component, no server action -- submitting it is just
 * a normal navigation to "/appointments?view=custom&from=...&to=..."), so it works identically with or without
 * JavaScript. A range that doesn't make sense (see lib/appointments/view-params.ts's rangeError) shows its message
 * here, right by the fields that caused it, with both still filled in exactly as submitted.
 */
export function CustomRangeForm({ from, to, rangeError, doctor }: CustomRangeFormProps): ReactElement {
  return (
    <div className="mt-4">
      <form action="/appointments" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="custom" />
        {doctor === null ? null : <input type="hidden" name="doctor" value={doctor} />}
        <div>
          <label htmlFor="custom-range-from" className="block text-[0.8125rem] font-medium text-ink-soft">
            From
          </label>
          <input id="custom-range-from" name="from" type="date" defaultValue={from} max={MAX_DATE} className={FIELD_CLASSES} />
        </div>
        <div>
          <label htmlFor="custom-range-to" className="block text-[0.8125rem] font-medium text-ink-soft">
            To
          </label>
          <input id="custom-range-to" name="to" type="date" defaultValue={to} max={MAX_DATE} className={FIELD_CLASSES} />
        </div>
        <SubmitButton size="sm">Apply</SubmitButton>
      </form>
      {rangeError === null ? null : (
        <p role="alert" className="mt-2 text-sm text-accent-deep">
          {rangeError}
        </p>
      )}
    </div>
  );
}
