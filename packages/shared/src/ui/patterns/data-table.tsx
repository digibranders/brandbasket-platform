"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { useConfirmRun, type ConfirmCopy } from "./confirm-copy";
import { extendSelection, stepCursor, toggleId } from "./data-table-logic";
import { RowActions, type RowActionItem } from "./row-actions";
import { hasOpenLayer } from "./use-layer";
import { isTypingTarget } from "./use-shortcuts";

export interface Column<Row> {
  readonly id: string;
  /** 12px muted, sentence case. */
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** `end` for Mono figures and ages. */
  readonly align?: "start" | "end";
  /** Drops the column on a phone. */
  readonly hideBelow?: "sm";
  /** Column choice, only for optional money columns. */
  readonly hidden?: boolean;
}

export interface RowGroup {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface PrimaryVerb {
  readonly label: string;
  readonly onRun: () => void;
  readonly confirm?: ConfirmCopy;
  readonly disabled?: string;
  readonly busy?: boolean;
  readonly busyLabel?: string;
}

export interface DataTableProps<Row> {
  /** Names the table for screen readers. */
  readonly label: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowId: (row: Row) => string;
  readonly primaryVerb?: (row: Row) => PrimaryVerb;
  readonly menu?: (row: Row) => readonly RowActionItem[];
  readonly selectable?: boolean;
  readonly selectedIds?: ReadonlySet<string>;
  readonly onSelectionChange?: (ids: ReadonlySet<string>) => void;
  /** The row whose panel is open (marker). */
  readonly openId?: string | null;
  readonly onOpen?: (id: string) => void;
  /** Bands such as Late and Due today. Rows are expected in group order; `rowGroup` says which band a row belongs to. */
  readonly groups?: readonly RowGroup[];
  readonly rowGroup?: (row: Row) => string;
  readonly state: "ready" | "loading" | "empty" | "error";
  readonly empty?: ReactNode;
  readonly error?: ReactNode;
  /** The reason text when a row cannot be acted on, else null. */
  readonly isDisabledRow?: (row: Row) => string | null;
  /** 44px rows by default; `compact` is 36px and is for read-only registers (Invoices, Access log). */
  readonly density?: "regular" | "compact";
}

const CELL = "border-b border-border px-3 align-middle";
const LOADING_ROWS = 3;

/**
 * DataTable: the one list pattern. Sticky 36px header, 44px rows, the object first, one verb and a three dot menu last.
 * The table is a single tab stop; its keyboard cursor is the active descendant (j k, Enter, e, x, Space, Shift, Ctrl A, `.`).
 * Selected and open rows take the gold wash with a 3px marker; the cursor is a 2px ink marker so the two never look alike.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  rowId,
  primaryVerb,
  menu,
  selectable = false,
  selectedIds,
  onSelectionChange,
  openId = null,
  onOpen,
  groups,
  rowGroup,
  state,
  empty,
  error,
  isDisabledRow,
  density = "regular",
}: DataTableProps<Row>): ReactElement {
  const uid = useId();
  const visible = useMemo(() => columns.filter((column) => !column.hidden), [columns]);
  const ids = useMemo(() => rows.map(rowId), [rows, rowId]);
  const disabledReasons = useMemo(() => rows.map((row) => isDisabledRow?.(row) ?? null), [rows, isDisabledRow]);
  const selectableIds = useMemo(() => ids.filter((_, index) => disabledReasons[index] === null), [ids, disabledReasons]);

  const [cursor, setCursor] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [innerSelected, setInnerSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selected = selectedIds ?? innerSelected;
  const confirmRun = useConfirmRun();
  const headerCheckbox = useRef<HTMLInputElement>(null);

  const setSelected = (next: ReadonlySet<string>): void => {
    if (selectedIds === undefined) setInnerSelected(next);
    onSelectionChange?.(next);
  };

  const rowDomId = (id: string): string => `${uid}-row-${ids.indexOf(id)}`;
  const selectedCount = selectableIds.filter((id) => selected.has(id)).length;

  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = selectedCount > 0 && selectedCount < selectableIds.length;
  }, [selectedCount, selectableIds.length]);

  const moveCursor = (delta: 1 | -1, extend: boolean): void => {
    const next = stepCursor(ids, cursor, delta);
    if (next === null) return;
    setCursor(next);
    if (extend && selectable) {
      const from = anchor ?? cursor ?? next;
      setAnchor(from);
      setSelected(extendSelection(selectableIds, selected, from, next));
    } else {
      setAnchor(null);
    }
    if (openId !== null) onOpen?.(next);
  };

  const toggleRow = (id: string): void => {
    if (!selectable) return;
    setSelected(toggleId(selected, id));
    setAnchor(id);
  };

  const rowAt = (id: string | null): Row | undefined => (id === null ? undefined : rows[ids.indexOf(id)]);

  const runVerbFor = (row: Row): void => {
    const verb = primaryVerb?.(row);
    const reason = disabledReasons[rows.indexOf(row)];
    if (!verb || verb.busy || verb.disabled !== undefined || reason) return;
    confirmRun.request(verb.confirm, verb.onRun);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>): void => {
    const target = event.target as HTMLElement;
    if (isTypingTarget(target) || target.closest("[role='menu'], dialog")) return;
    if (event.altKey) return;
    const onTable = target === event.currentTarget;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (mod && key.toLowerCase() === "a" && selectable) {
      event.preventDefault();
      setSelected(new Set(selectableIds));
      return;
    }
    if (mod) return;
    if (key === "Escape") {
      if (selectedCount > 0 && !hasOpenLayer()) setSelected(new Set());
      return;
    }
    if (key === "j" || key === "J" || (onTable && key === "ArrowDown")) {
      event.preventDefault();
      moveCursor(1, event.shiftKey);
    } else if (key === "k" || key === "K" || (onTable && key === "ArrowUp")) {
      event.preventDefault();
      moveCursor(-1, event.shiftKey);
    } else if (onTable && key === "Enter" && cursor !== null) {
      event.preventDefault();
      onOpen?.(cursor);
    } else if (key === "e" && cursor !== null) {
      const row = rowAt(cursor);
      if (row !== undefined) {
        event.preventDefault();
        runVerbFor(row);
      }
    } else if ((key === "x" || (onTable && key === " ")) && cursor !== null) {
      event.preventDefault();
      if (disabledReasons[ids.indexOf(cursor)] === null) toggleRow(cursor);
    } else if ((key === "." || (key === "F10" && event.shiftKey)) && cursor !== null && menu) {
      event.preventDefault();
      setMenuRow(cursor);
    }
  };

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, id: string): void => {
    if ((event.target as HTMLElement).closest("button, a, input, label, [role='menu']")) return;
    setCursor(id);
    onOpen?.(id);
  };

  const rowHeight = density === "compact" ? "h-9" : "h-11";
  const hasActions = primaryVerb !== undefined || menu !== undefined;
  const span = visible.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);

  const headCell = (column: Column<Row>): ReactElement => (
    <th
      key={column.id}
      scope="col"
      className={`sticky top-0 z-10 h-9 whitespace-nowrap border-b border-border bg-surface px-3 text-xs font-semibold text-ink-2 ${column.align === "end" ? "text-right" : "text-left"} ${column.hideBelow ? "max-[860px]:hidden" : ""}`}
    >
      {column.header}
    </th>
  );

  const header = (
    <thead>
      <tr>
        {selectable ? (
          <th scope="col" className="sticky top-0 z-10 h-9 w-11 border-b border-border bg-surface pl-3 text-left">
            <input
              ref={headerCheckbox}
              type="checkbox"
              aria-label="Select all"
              checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
              disabled={selectableIds.length === 0}
              onChange={() => setSelected(selectedCount === selectableIds.length ? new Set() : new Set(selectableIds))}
              className="size-[18px] accent-ink"
            />
          </th>
        ) : null}
        {visible.map(headCell)}
        {hasActions ? (
          <th scope="col" className="sticky top-0 z-10 h-9 border-b border-border bg-surface px-3 text-right">
            <span className="sr-only">Actions</span>
          </th>
        ) : null}
      </tr>
    </thead>
  );

  const skeletonBody = (
    <tbody>
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <tr key={index}>
          <td colSpan={span} className={`${CELL} ${rowHeight}`}>
            <div className="motion-pulse h-3 rounded-[6px] bg-surface-hover" style={{ width: `${62 - index * 11}%` }} />
          </td>
        </tr>
      ))}
    </tbody>
  );

  const rowsBody = (
    <tbody className="[&>tr:last-child>td]:border-b-0">
      {rows.map((row, index) => {
        const id = ids[index] as string;
        const reason = disabledReasons[index] ?? null;
        const isSelected = selected.has(id);
        const isOpen = openId === id;
        const isCursor = cursor === id;
        const verb = primaryVerb?.(row);
        const band = groups && rowGroup ? groups.find((group) => group.id === rowGroup(row)) : undefined;
        const previousBand = groups && rowGroup && index > 0 ? rowGroup(rows[index - 1] as Row) : undefined;
        const showBand = band !== undefined && (index === 0 || previousBand !== band.id);
        const marker = isSelected || isOpen ? "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-accent-gold)]" : isCursor ? "[&>td:first-child]:shadow-[inset_2px_0_0_var(--color-ink-2)]" : "";
        return (
          <Fragment key={id}>
            {showBand ? (
              <tr>
                <th scope="rowgroup" colSpan={span} className="sticky top-9 z-[5] border-b border-border bg-canvas px-3 py-2 text-left text-xs font-semibold text-ink-2">
                  {band.label} <span className="font-mono font-medium">{band.count}</span>
                </th>
              </tr>
            ) : null}
            <tr
              id={rowDomId(id)}
              aria-selected={selectable ? isSelected : undefined}
              data-row-id={id}
              onClick={(event) => onRowClick(event, id)}
              className={`transition-colors duration-100 hover:bg-row-hover ${isSelected || isOpen ? "bg-gold-soft hover:bg-gold-soft" : ""} ${reason ? "text-ink-3" : ""} ${marker}`}
            >
              {selectable ? (
                <td className={`${CELL} ${rowHeight} w-11 pl-3 pr-0`}>
                  <input
                    type="checkbox"
                    aria-label={reason ? "Select row, unavailable" : "Select row"}
                    checked={isSelected}
                    disabled={reason !== null}
                    onChange={() => toggleRow(id)}
                    className="size-[18px] accent-ink"
                  />
                </td>
              ) : null}
              {visible.map((column) => (
                <td
                  key={column.id}
                  className={`${CELL} ${rowHeight} ${column.align === "end" ? "text-right" : ""} ${column.hideBelow ? "max-[860px]:hidden" : ""}`}
                >
                  {column.cell(row)}
                </td>
              ))}
              {hasActions ? (
                <td
                  className={`${CELL} ${rowHeight} w-px whitespace-nowrap text-right`}
                  onContextMenu={(event) => {
                    if (!menu) return;
                    event.preventDefault();
                    setMenuRow(id);
                  }}
                >
                  <RowActions
                    verb={
                      verb
                        ? {
                            label: verb.label,
                            onRun: verb.onRun,
                            confirm: verb.confirm,
                            busy: verb.busy,
                            busyLabel: verb.busyLabel,
                            disabledReason: verb.disabled ?? reason ?? undefined,
                          }
                        : undefined
                    }
                    items={menu?.(row) ?? []}
                    open={menuRow === id}
                    onOpenChange={(next) => setMenuRow(next ? id : null)}
                  />
                </td>
              ) : null}
            </tr>
          </Fragment>
        );
      })}
    </tbody>
  );

  const stateBody = (content: ReactNode): ReactElement => (
    <tbody>
      <tr>
        <td colSpan={span} className="p-0">
          {content}
        </td>
      </tr>
    </tbody>
  );

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-card">
      <table
        aria-label={label}
        role="grid"
        tabIndex={0}
        aria-busy={state === "loading" || undefined}
        aria-activedescendant={cursor !== null && ids.includes(cursor) ? rowDomId(cursor) : undefined}
        onKeyDown={onKeyDown}
        className="w-full border-separate border-spacing-0 font-sans text-[13.5px] leading-5 text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        {header}
        {state === "loading" ? skeletonBody : state === "empty" ? stateBody(empty) : state === "error" ? stateBody(error) : rowsBody}
      </table>
      {state === "loading" ? <span role="status" className="sr-only">Loading the list</span> : null}
      {confirmRun.dialog}
    </div>
  );
}
