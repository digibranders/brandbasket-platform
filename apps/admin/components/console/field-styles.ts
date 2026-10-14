/**
 * Form controls for the staff console. Applied to plain native elements so every form keeps its own behaviour.
 * The border is ink-soft at 65% (3.5:1 on card and paper) so a field's edge is visible, as WCAG 1.4.11 asks; the
 * placeholder is ink-soft at 80% (5.2:1), clearly quieter than typed ink but still readable.
 */

export const fieldClasses =
  "mt-2 block w-full rounded-2xl border border-ink-soft/65 bg-card px-4 py-3 text-base text-ink transition-[border-color,box-shadow] duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-accent";

export const labelClasses = "block text-sm font-medium text-ink";

export const hintClasses = "mt-1 text-sm leading-snug text-ink-soft";

/** A read-only value shown where a control would be, e.g. a status that can no longer change. */
export const readOnlyValueClasses = "mt-2 block rounded-2xl bg-paper-deep px-4 py-3 text-base text-ink";

export const checkboxClasses = "mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]";
