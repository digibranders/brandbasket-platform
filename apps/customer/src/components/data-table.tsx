"use client";

import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  EmptyState,
  Icon,
  Sheet,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  type EmptyStateProps,
} from "@/ui";

export type SortDirection = "asc" | "desc";
export type SortValue = string | number | Date;

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** `low` columns hide on phones (plan 60, DataTable). */
  readonly priority?: "high" | "low";
  readonly align?: "start" | "end";
  /** Makes the column sortable by this value. */
  readonly sortValue?: (row: T) => SortValue;
}

/** What the inspector shows for one record. */
export interface InspectorContent {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly body: ReactNode;
  /** One primary action at most. */
  readonly footer?: ReactNode;
}

export interface DataTableProps<T> {
  /** Names the table for screen readers: "Enquiries". */
  readonly label: string;
  readonly rows: readonly T[];
  readonly columns: readonly DataTableColumn<T>[];
  readonly rowKey: (row: T) => string;
  /** The row opens its record in the inspector, kept in the URL as `?open=<id>` so the link can be shared and Back closes it. */
  readonly inspect?: (row: T) => InspectorContent;
  /** Or the row opens a page. */
  readonly rowHref?: (row: T) => string;
  readonly defaultSort?: { readonly key: string; readonly direction: SortDirection };
  /** Shown instead of the table when there are no rows. */
  readonly empty: EmptyStateProps;
  /** The footer's count: `(n) => formatQuantity(n, "enquiry", "enquiries")`. */
  readonly count: (rows: number) => string;
  /** Beside the count, such as Pagination. */
  readonly footer?: ReactNode;
  /** The query parameter that holds the open record. */
  readonly openParam?: string;
}

function compare(a: SortValue, b: SortValue): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-IN", { sensitivity: "base", numeric: true });
}

/** Rows in the column's order, stable for ties. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): readonly T[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => sign * compare(value(left.row), value(right.row)) || left.index - right.index)
    .map(({ row }) => row);
}

const INTERACTIVE = "a, button, input, select, textarea, label, [role='menuitem']";

/**
 * A real table of records (plan 60, DataTable): sortable headers, low-priority columns hidden on phones, a row that opens
 * its record in the inspector (or a page), the count in the footer, and an empty state instead of an empty table. The
 * first cell holds the row's link or button, so the keyboard reaches every record.
 */
export function DataTable<T>({ label, rows, columns, rowKey, inspect, rowHref, defaultSort, empty, count, footer, openParam = "open" }: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort);
  const [openId, setOpenId] = useQueryState(openParam, parseAsString.withOptions({ history: "push", scroll: false }));

  const sorted = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sort?.key);
    return column?.sortValue === undefined || sort === undefined ? rows : sortRows(rows, column.sortValue, sort.direction);
  }, [columns, rows, sort]);

  if (rows.length === 0) return <EmptyState {...empty} />;

  const openRow = inspect === undefined || openId === null ? undefined : rows.find((row) => rowKey(row) === openId);
  const opened = openRow === undefined || inspect === undefined ? undefined : inspect(openRow);

  const toggle = (key: string) =>
    setSort((current) => ({ key, direction: current?.key === key && current.direction === "asc" ? "desc" : "asc" }));

  const onRowClick = (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE) !== null) return;
    if (inspect !== undefined) void setOpenId(rowKey(row));
    else if (rowHref !== undefined) event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
  };

  const opener = (row: T, content: ReactNode) => {
    if (inspect !== undefined) {
      return (
        <button type="button" onClick={() => void setOpenId(rowKey(row))} className="text-left font-medium text-ink outline-offset-2 hover:underline">
          {content}
        </button>
      );
    }
    if (rowHref !== undefined) {
      return (
        <Link href={rowHref(row)} data-row-link className="font-medium text-ink no-underline hover:underline">
          {content}
        </Link>
      );
    }
    return <span className="font-medium text-ink">{content}</span>;
  };

  return (
    <>
      <Table aria-label={label}>
        <TableHead>
          {columns.map((column) => {
            const direction = sort?.key === column.key ? sort.direction : undefined;
            return (
              <TableHeader
                key={column.key}
                hideOnPhone={column.priority === "low"}
                align={column.align}
                aria-sort={direction === undefined ? undefined : direction === "asc" ? "ascending" : "descending"}
              >
                {column.sortValue === undefined ? (
                  column.header
                ) : (
                  <button type="button" onClick={() => toggle(column.key)} className="inline-flex items-center gap-1 hover:text-ink">
                    {column.header}
                    <Icon name={direction === undefined ? "CaretUpDown" : direction === "asc" ? "ArrowUp" : "ArrowDown"} size="sm" className="size-3.5" />
                  </button>
                )}
              </TableHeader>
            );
          })}
        </TableHead>
        <TableBody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const clickable = inspect !== undefined || rowHref !== undefined;
            return (
              <TableRow key={key} interactive={clickable} selected={key === openId} onClick={clickable ? onRowClick(row) : undefined}>
                {columns.map((column, index) => (
                  <TableCell key={column.key} hideOnPhone={column.priority === "low"} align={column.align}>
                    {index === 0 ? opener(row, column.cell(row)) : column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TableFooter>
        <span className="flex-1">{count(rows.length)}</span>
        {footer}
      </TableFooter>
      {inspect === undefined ? null : (
        <Sheet
          open={opened !== undefined}
          onOpenChange={(open) => {
            if (!open) void setOpenId(null);
          }}
          title={opened?.title ?? ""}
          description={opened?.description}
          footer={opened?.footer}
        >
          {opened?.body}
        </Sheet>
      )}
    </>
  );
}

/** The table's skeleton under its real panel title while rows load. */
export function DataTableLoading({ columns, rows = 5 }: { readonly columns: number; readonly rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-row items-center gap-4 border-b border-border-subtle px-4 last:border-b-0">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={column === 0 ? "w-1/4" : "w-1/6"} />
          ))}
        </div>
      ))}
    </div>
  );
}
