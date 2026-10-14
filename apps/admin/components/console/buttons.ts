/**
 * Button looks for the staff console, as class strings so they apply to a `button`, a `Link` or an `a` alike.
 * Sentence case throughout: the old uppercase, letter-spaced labels shouted on every screen.
 */

const BASE =
  "console-motion inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,box-shadow,translate] duration-300 ease-calm hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

/** The one action a screen is for. */
export const buttonPrimary = `${BASE} bg-(--console-primary) px-5 py-2.5 text-paper hover:bg-(--console-primary-hover)`;

/** Everything else a screen offers. */
export const buttonSecondary = `${BASE} px-5 py-2.5 text-ink ring-1 ring-inset ring-line hover:ring-ink/40`;

/** Destructive actions: quiet until hovered, so they are never the obvious thing to press. */
export const buttonDanger = `${BASE} px-5 py-2.5 text-(--console-danger) ring-1 ring-inset ring-(--console-danger)/40 hover:bg-(--console-danger) hover:text-paper`;

/** The primary action inside dark glass, where ink would disappear. */
export const buttonGold = `${BASE} bg-gold px-4 py-2 text-ink hover:bg-(--console-gold-hover)`;
