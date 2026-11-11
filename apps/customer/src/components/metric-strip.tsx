import { formatDate } from "@/lib/format";
import { Skeleton } from "@/ui";
import { Delta, type DeltaProps } from "./delta";

export interface Metric {
  readonly label: string;
  /** Already written with @/lib/format. An unknown value is left out of the strip, never shown as 0 or a dash. */
  readonly value: string;
  /** Beside the value, smaller: "visits", "of 12". */
  readonly unit?: string;
  readonly change?: DeltaProps;
  /** What the number covers: "Last 30 days". */
  readonly period?: string;
  /** When its source last updated it. */
  readonly asOf?: Date;
}

const CELLS = "min-w-0 bg-surface px-4 py-3.5 max-lg:odd:last:col-span-2";

/**
 * Two to five numbers in one panel (plan 60, MetricStrip). Never separate KPI cards. One row on desktop, two by two below
 * 1100px.
 */
export function MetricStrip({ metrics, label }: { readonly metrics: readonly Metric[]; readonly label: string }) {
  if (metrics.length === 0) return null;
  return (
    <dl aria-label={label} className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
      {metrics.map((metric) => {
        const context = [metric.period, metric.asOf === undefined ? undefined : `Updated ${formatDate(metric.asOf)}`].filter((part) => part !== undefined);
        return (
          <div key={metric.label} className={CELLS}>
            <dt className="type-meta">{metric.label}</dt>
            <dd className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="type-metric">{metric.value}</span>
              {metric.unit === undefined ? null : <span className="type-meta">{metric.unit}</span>}
              {metric.change === undefined ? null : <Delta {...metric.change} />}
            </dd>
            {context.length === 0 ? null : <dd className="m-0 mt-0.5 type-meta">{context.join(". ")}</dd>}
          </div>
        );
      })}
    </dl>
  );
}

/** The strip's skeleton, the same shape, while its numbers load. */
export function MetricStripLoading({ count = 4 }: { readonly count?: number }) {
  return (
    <div aria-busy="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${CELLS} flex flex-col gap-2.5`}>
          <Skeleton className="w-1/2" />
          <Skeleton className="h-7 w-1/3" />
        </div>
      ))}
    </div>
  );
}
