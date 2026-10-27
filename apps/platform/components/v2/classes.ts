/** Class strings every v2 screen shares (apps/platform/DESIGN.md "Surfaces"). */

/** The one raised surface on a screen. */
export const LIFT = "rounded-lift bg-surface shadow-lift";

/** A section that sits on the page: its title with the hairline under it. */
export const SECTION_TITLE = "border-b border-line pb-2.5 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink";

/** The screen's one main action. */
export const DARK_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[0.625rem] bg-ink px-5 text-sm font-semibold text-white transition-transform duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";

/**
 * The dark button's shape for the shared SubmitButton (packages/shared/src/ui/panel/submit-button.tsx), which keeps its
 * "disabled until the form is complete" rule. Its pill shape and size are overridden with `!`, as the classes are joined, not merged.
 */
export const DARK_BUTTON_SHAPE = "h-11! rounded-[0.625rem]! px-5! text-sm! hover:bg-ink-raised!";

/** Every other action: a soft fill, never an outline. */
export const SOFT_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sunken px-3.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-200 hover:bg-line active:translate-y-px";

/** A small square in a service's colour, before its name. */
export const SERVICE_DOT = { website: "bg-c-site", social: "bg-c-growth", search: "bg-c-search" } as const;
