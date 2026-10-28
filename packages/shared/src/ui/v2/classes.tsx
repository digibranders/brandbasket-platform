/**
 * Class strings both v2 apps share (the customer dashboard and the staff console; apps/platform/DESIGN.md and
 * apps/admin/DESIGN.md "Surfaces"). A .tsx file only because the package's `./ui/*` export resolves to .tsx.
 */

/** The one raised surface on a screen. */
export const LIFT = "rounded-lift bg-surface shadow-lift";

/** A section that sits on the page: its title with the hairline under it. */
export const SECTION_TITLE = "border-b border-line pb-2.5 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink";
