/** The resting, focus, error and disabled look shared by text inputs, textareas, selects and comboboxes (plan 60, section 10). */
export const CONTROL =
  "w-full rounded-control border border-border-control bg-surface text-ink type-body shadow-control transition-[border-color,box-shadow] duration-100 placeholder:text-ink-muted focus:border-ring focus:shadow-focus focus:outline-none focus-visible:outline-none aria-invalid:border-neg-text data-invalid:border-neg-text data-disabled:cursor-not-allowed data-disabled:bg-surface-disabled data-disabled:text-ink-disabled disabled:cursor-not-allowed disabled:bg-surface-disabled disabled:text-ink-disabled";

/** Menus, select and combobox lists. */
export const POPUP = "motion-menu z-50 rounded-panel border border-border bg-surface p-1 shadow-pop outline-none";

/** One row of a menu or list: 32px. */
export const OPTION =
  "flex h-8 cursor-default select-none items-center gap-2.5 rounded-badge px-2.5 type-table text-ink outline-none data-highlighted:bg-surface-hover data-disabled:text-ink-disabled";
