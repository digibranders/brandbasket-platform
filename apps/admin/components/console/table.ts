/** Class strings for every list table in the console (apps/admin/DESIGN.md "Lists"). */

export const TABLE = "w-full border-collapse text-[0.84375rem]";
export const TH = "whitespace-nowrap border-b border-line px-2.5 py-2 text-left text-xs font-semibold text-ink-2 first:pl-0 last:pr-0";
export const TD = "border-b border-line px-2.5 py-2.5 align-middle first:pl-0 last:pr-0";
/** Money and counts: right-aligned, in the figure face. */
export const TD_NUM = `${TD} text-right font-figure tabular-nums`;
/** Dates and times: small, quiet, in the figure face. */
export const TD_TIME = `${TD} whitespace-nowrap font-figure text-xs text-ink-2`;
/** The row whose detail is open beside the list. */
export const TR_SELECTED = "bg-surface [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-ink)]";
