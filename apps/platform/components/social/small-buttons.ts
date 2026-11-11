/**
 * Small, rounded buttons for the cards of the review page, where the page's full-size buttons are too big for a row of choices.
 * `SMALL_WHITE` is for a grey card, `SMALL_SOFT` for a white one, `SMALL_DARK` is the one main action of a card.
 */
const SMALL = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold transition-colors duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export const SMALL_WHITE = `${SMALL} bg-surface text-ink shadow-sm hover:bg-line`;
export const SMALL_SOFT = `${SMALL} bg-sunken text-ink hover:bg-line`;
export const SMALL_DARK = `${SMALL} bg-ink text-white hover:bg-ink-raised`;

/** The brand's accent colour, for the Social page's one main action in its top corner. */
export const SMALL_ACCENT = `${SMALL} h-9 bg-rattan-text px-4 text-white hover:opacity-90`;
