/** Class strings every v2 screen shares (apps/platform/DESIGN.md "Surfaces"). */

export { LIFT, SECTION_TITLE } from "@brandbasket/shared/ui/v2/classes";

/** The widest a page's content grows, left-aligned in the content area (about 1560px). Everything above it is empty margin. */
export const PAGE_MAX = "max-w-[97.5rem]";

/**
 * The vertical rhythm: the space between the blocks of a page, and between the sections of a column. 24px on phones, 32px from
 * md. Inside a block the scale is 16px (a section's title to its rows is `pt-4`) and 8px (a title to its line under it).
 */
export const STACK = "grid grid-cols-[minmax(0,1fr)] gap-6 md:gap-8";

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
