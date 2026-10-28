/**
 * Button looks for the staff console, as class strings so they apply to a `button`, a `Link` or an `a` alike. One dark
 * button per screen; every other button is a soft fill with no outline (apps/admin/DESIGN.md "Surfaces").
 */

const BASE =
  "console-motion inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.625rem] font-semibold transition-[background-color,color,translate] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

/** The one action a screen is for. */
export const buttonPrimary = `${BASE} h-9 bg-ink px-4 text-[0.8125rem] text-white hover:bg-ink-raised`;

/** Everything else a screen offers. */
export const buttonSecondary = `${BASE} h-9 bg-sunken px-4 text-[0.8125rem] text-ink hover:bg-line`;

/** A secondary action inside a table row. */
export const buttonSmall = `${BASE} h-7 bg-sunken px-2.5 text-xs text-ink hover:bg-line`;

/** Destructive actions: quiet until hovered, so they are never the obvious thing to press. */
export const buttonDanger = `${BASE} h-9 bg-sunken px-4 text-[0.8125rem] text-error hover:bg-error hover:text-white`;
