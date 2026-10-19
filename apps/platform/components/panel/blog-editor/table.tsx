import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/*
 * One table layout for every content list (posts, authors, categories), so they read as one system: fixed column
 * widths set by each table's <colgroup>, so headers sit exactly over their cells and nothing shifts when a filter
 * changes the rows; every column left-aligned; and a serial number first. Cells carry no left padding, so a column's
 * text starts where the column starts.
 */
export const TABLE_CLASS = "w-full table-fixed text-left text-sm";
export const TABLE_HEAD_ROW_CLASS = "border-b border-line text-xs text-ink-soft";
export const TH_CLASS = "py-3 pr-6 text-left font-medium";
export const TD_CLASS = "py-3.5 pr-6 align-middle";
export const TABLE_ROW_CLASS =
  "relative border-b border-line/60 transition-colors duration-200 ease-calm hover:bg-paper-deep/50";
/** Column widths shared by the three tables, as classes for <col>. */
export const COL_SERIAL = "w-14";
export const COL_DATE = "w-32";
export const COL_POSTS = "w-48";

/** The "No." column: the row's place in the list as it is shown now, so it always runs 1, 2, 3… */
export function SerialCell({ index }: { readonly index: number }): ReactElement {
  return <td className={cn(TD_CLASS, "tabular-nums text-ink-soft")}>{index + 1}</td>;
}
