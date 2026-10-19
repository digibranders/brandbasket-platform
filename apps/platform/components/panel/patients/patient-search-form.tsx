import type { ReactElement } from "react";
import type { PatientFilter } from "@brandbasket/db";
import { PATIENT_SEARCH_MAX_LENGTH } from "@brandbasket/shared/lib/patients/limits";
import { Button } from "@brandbasket/shared/ui/panel/button";

interface PatientSearchFormProps {
  /** The search in force, shown back in the box. */
  readonly search: string;
  /** The filter in force, carried through as a hidden field so a new search keeps it. */
  readonly filter: PatientFilter;
}

/** components/panel/form/panel-form.tsx's FIELD_CLASSES, repeated here for the same reason custom-range-form.tsx
 * repeats it: that module is a client component, and this form is plain server-rendered HTML. */
const FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";

/**
 * The list's search: a plain GET form (no client component, no server action -- submitting it is a normal
 * navigation to "/patients?q=..."), so it works the same with or without JavaScript. A name, or any 3 or more
 * digits of a phone number.
 */
export function PatientSearchForm({ search, filter }: PatientSearchFormProps): ReactElement {
  return (
    <form action="/patients" method="get" role="search" className="flex flex-wrap items-end gap-3">
      {filter === "all" ? null : <input type="hidden" name="filter" value={filter} />}
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <label htmlFor="patient-search" className="block text-[0.8125rem] font-medium text-ink-soft">
          Name or phone
        </label>
        <input
          id="patient-search"
          name="q"
          type="search"
          defaultValue={search}
          maxLength={PATIENT_SEARCH_MAX_LENGTH}
          autoComplete="off"
          className={FIELD_CLASSES}
        />
      </div>
      <Button type="submit" size="sm">
        Search
      </Button>
    </form>
  );
}
