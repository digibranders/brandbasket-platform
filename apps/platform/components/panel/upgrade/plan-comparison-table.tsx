import type { ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { ChevronDownIcon, TickIcon } from "@fynix/shared/ui/icons";
import { BRAND, sellsFreeListing, type Brand } from "@/lib/brand";
import { cellWords, COMPARISON_COLUMNS, comparisonRowsFor, type ComparisonCell, type ComparisonColumnId } from "@/lib/plan-comparison";

interface PlanComparisonTableProps {
  /** The customer's own column, tagged "Your plan". */
  readonly yours: ComparisonColumnId;
  /** The brand the table is worded for. It also decides whether the Free column is shown: not under a brand that sells no free listing (Fynix). */
  readonly brand?: Brand;
}

/** A row's columns: the label, then Free, Care, Premium. On a phone the label takes its own line and the plans share the next. */
const ROW = "grid grid-cols-3 items-center gap-x-3 sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]";
/** The same without the Free column. */
const ROW_WITHOUT_FREE = "grid grid-cols-2 items-center gap-x-3 sm:grid-cols-[minmax(0,1.7fr)_repeat(2,minmax(0,1fr))]";

function Mark({ cell, words }: { readonly cell: ComparisonCell; readonly words: string }): ReactElement {
  if (typeof cell === "string") return <span>{words}</span>;
  return (
    <>
      {cell ? <TickIcon className="size-4 text-success" /> : <span aria-hidden="true" className="text-ink-soft">–</span>}
      <span className="sr-only">{words}</span>
    </>
  );
}

/**
 * "Compare all features": one collapsed row that opens the sixteen-row Free / Care / Premium table. Premium's column is
 * tinted and the customer's own is tagged "Your plan". Every cell has a word for a screen reader, since a tick and a dash
 * say nothing without sight. On a phone each row stacks: its label, then the three plans under it, each named.
 */
export function PlanComparisonTable({ yours, brand = BRAND }: PlanComparisonTableProps): ReactElement {
  const showFree = sellsFreeListing(brand);
  const columns = showFree ? COMPARISON_COLUMNS : COMPARISON_COLUMNS.filter((column) => column.id !== "free");
  const rowClasses = showFree ? ROW : ROW_WITHOUT_FREE;
  return (
    <details className="group mt-10 border-y border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        Compare all features
        <ChevronDownIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-open:rotate-180" />
      </summary>

      <div role="table" aria-label={showFree ? "Compare Free, Care and Premium" : "Compare Care and Premium"} className="pb-4 text-[0.9375rem]">
        <div role="row" className={cn(rowClasses, "max-sm:sr-only border-b border-line pb-3 text-sm font-semibold")}>
          <span role="columnheader" className="text-ink-soft">
            Feature
          </span>
          {columns.map((column) => (
            <span key={column.id} role="columnheader" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", column.id === "premium" && "text-gold-deep")}>
              {column.name}
              {column.id === yours ? (
                <span className="rounded-[0.375rem] bg-paper-deep px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ink">Your plan</span>
              ) : null}
            </span>
          ))}
        </div>

        {comparisonRowsFor(brand).map((row) => (
          <div key={row.id} role="row" className={cn(rowClasses, "gap-y-2 border-b border-line py-3 last:border-b-0")}>
            <span role="rowheader" className={cn("font-medium sm:col-span-1", showFree ? "col-span-3" : "col-span-2")}>
              {row.label}
            </span>
            {columns.map((column) => (
              <span
                key={column.id}
                role="cell"
                className={cn("flex flex-col items-start gap-0.5 rounded-[0.375rem] px-2 py-1 sm:flex-row sm:items-center sm:gap-2", column.id === "premium" && "bg-gold/15")}
              >
                {/* Named on a phone, where there is no header row above the cells. */}
                <span aria-hidden="true" className="text-[0.6875rem] font-semibold text-ink-soft sm:hidden">
                  {column.name}
                  {column.id === yours ? " · Your plan" : ""}
                </span>
                <Mark cell={row[column.id]} words={cellWords(row, column.id)} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
