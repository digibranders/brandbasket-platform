import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";

/*
 * A real <table> for records (plan 60, DataTable): 36px header, 44px rows (52px on phones). Low-priority columns hide on
 * phones with hideOnPhone on both the header and the cells. Sorting, selection and row actions belong to the DataTable
 * application component built on these.
 */

export function Table({ className, children, ...rest }: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="overflow-x-auto">
      <table {...rest} className={cx("w-full border-collapse type-table", className)}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { readonly children: ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { readonly children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

interface CellOptions {
  /** Hidden below 861px. */
  readonly hideOnPhone?: boolean;
  readonly align?: "start" | "end";
}

const cellLayout = ({ hideOnPhone, align }: CellOptions) => cx(hideOnPhone === true && "hidden md:table-cell", align === "end" ? "text-right" : "text-left");

export function TableHeader({ hideOnPhone, align, className, children, ...rest }: Omit<ComponentPropsWithoutRef<"th">, "align"> & CellOptions) {
  return (
    <th
      scope="col"
      {...rest}
      className={cx(
        "h-table-header border-b border-border bg-surface-subtle px-3 type-label whitespace-nowrap text-ink-3 md:px-4",
        cellLayout({ hideOnPhone, align }),
        className,
      )}
    >
      {children}
    </th>
  );
}

export interface TableRowProps extends ComponentPropsWithoutRef<"tr"> {
  /** The row whose record is open in the inspector. */
  readonly selected?: boolean;
  /** The row opens a record: it shows the hover state. Put the link or button in its first cell for the keyboard. */
  readonly interactive?: boolean;
}

export function TableRow({ selected = false, interactive = false, className, children, ...rest }: TableRowProps) {
  return (
    <tr
      {...rest}
      aria-selected={selected || undefined}
      className={cx(
        "border-b border-border-subtle last:border-b-0",
        interactive && "cursor-pointer hover:bg-surface-hover",
        selected && "bg-surface-selected hover:bg-surface-selected",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TableCell({ hideOnPhone, align, className, children, ...rest }: Omit<ComponentPropsWithoutRef<"td">, "align"> & CellOptions) {
  return (
    <td {...rest} className={cx("h-row px-3 py-1.5 align-middle md:px-4", cellLayout({ hideOnPhone, align }), className)}>
      {children}
    </td>
  );
}

/** Under the table: states the count ("12 enquiries") and holds Pagination. */
export function TableFooter({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cx("flex items-center gap-2 border-t border-border px-4 py-2.5 type-meta", className)}>{children}</div>;
}
