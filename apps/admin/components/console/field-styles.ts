/**
 * Form controls for the staff console, to the premium language: label above, 42px control, 8px radius, a #CFCBC2 edge
 * that darkens on hover and takes the ink focus ring. Applied to plain native elements so every form keeps its own
 * behaviour. The edge is ink-2 at 65% (3.5:1 on the surface) so a field is visible, as WCAG 1.4.11 asks.
 */

export const fieldClasses =
  "mt-2 block min-h-[42px] w-full rounded-[8px] border border-ink-2/65 bg-surface px-3.5 py-2 text-[0.9375rem] text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-ink-2/80 hover:border-ink-2 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 focus:ring-offset-surface aria-[invalid=true]:border-error";

export const labelClasses = "block text-sm font-medium text-ink";

export const hintClasses = "mt-1 text-[0.8125rem] leading-snug text-ink-2";

/** A read-only value shown where a control would be, e.g. a status that can no longer change. */
export const readOnlyValueClasses = "mt-2 block rounded-[8px] bg-sunken px-3.5 py-2.5 text-[0.9375rem] text-ink";

export const checkboxClasses = "mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]";
