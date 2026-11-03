import type { ReactNode } from "react";
import type { LoadFailure, Loaded } from "@/lib/loaded";
import { formatDate, formatDateTime } from "@/lib/format";
import { Banner, EmptyState, Skeleton, type EmptyStateProps } from "@/ui";
import { cx } from "@/ui/cx";
import { RefreshButton } from "./refresh-button";

export interface PanelProps {
  readonly title?: ReactNode;
  /** One short line beside the title: a count, a period, when it was last updated. */
  readonly meta?: ReactNode;
  /** At most one control in the title row (plan 60, Panel). */
  readonly action?: ReactNode;
  /** No padding: for a table or a list of rows that brings its own. */
  readonly flush?: boolean;
  readonly footer?: ReactNode;
  readonly busy?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/** A titled block of a page: 12px radius, hairline border, no shadow. */
export function Panel({ title, meta, action, flush = false, footer, busy, className, children }: PanelProps) {
  const head = title !== undefined || action !== undefined;
  return (
    <section aria-busy={busy || undefined} className={cx("min-w-0 rounded-panel border border-border bg-surface", className)}>
      {head ? (
        <div className="flex min-h-panel-header flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-1.5">
          <h2 className="min-w-0 flex-1 type-section">{title}</h2>
          {meta === undefined ? null : <span className="type-meta">{meta}</span>}
          {action}
        </div>
      ) : null}
      <div className={flush ? undefined : "p-4"}>{children}</div>
      {footer === undefined ? null : <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-2.5 type-meta">{footer}</div>}
    </section>
  );
}

/** Why a panel is empty and what will appear (plan 60, section 13). Never "No data". */
export function PanelEmpty(props: EmptyStateProps) {
  return <EmptyState {...props} />;
}

export interface PanelErrorProps {
  readonly failure: LoadFailure;
  /** What could not be loaded, to finish "We could not load ...": "your enquiries". */
  readonly what?: string;
}

/** A failed panel says what failed, that the data is safe, and offers Try again. It is never hidden (plan 60, section 13). */
export function PanelError({ failure, what = "this" }: PanelErrorProps) {
  return (
    <Banner tone="neg" action={<RefreshButton />}>
      <strong className="font-semibold">We could not load {what}.</strong> Your data is safe. Try again, and if it keeps happening, tell us and quote
      this time: {formatDateTime(failure.at)}.
    </Banner>
  );
}

/** Skeleton rows under the panel's real title while its data loads. */
export function PanelLoading({ title, rows = 4 }: { readonly title?: ReactNode; readonly rows?: number }) {
  return (
    <Panel title={title} busy flush>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-4 border-b border-border-subtle px-4 py-3.5 last:border-b-0">
          <Skeleton className="w-1/4" />
          <Skeleton className="w-1/3" />
          <Skeleton className="w-1/8" />
        </div>
      ))}
    </Panel>
  );
}

export interface PanelDataProps<T> extends Omit<PanelProps, "children" | "meta" | "busy"> {
  /** What the panel's loader returned. */
  readonly data: Loaded<T>;
  readonly children: (data: T) => ReactNode;
  readonly meta?: ReactNode | ((data: T) => ReactNode);
  /** When the panel has nothing to show yet. Leave out together with `empty` when it always has something. */
  readonly isEmpty?: (data: T) => boolean;
  readonly empty?: EmptyStateProps;
  /** When the numbers were last updated, shown as the meta line when there is no other: "Last updated Mon 23 Nov". */
  readonly asOf?: (data: T) => Date | null;
  /** Finishes "We could not load ..." in the error state. */
  readonly what?: string;
}

/** A panel driven by one loader's `Loaded<T>`: its data, its empty state, its error state and how fresh it is. */
export function PanelData<T>({ data, children, meta, isEmpty, empty, asOf, what, flush, ...panel }: PanelDataProps<T>) {
  if (!data.ok) {
    return (
      <Panel {...panel}>
        <PanelError failure={data.error} {...(what === undefined ? {} : { what })} />
      </Panel>
    );
  }
  const updated = asOf?.(data.data) ?? null;
  const line = typeof meta === "function" ? meta(data.data) : (meta ?? (updated === null ? undefined : `Last updated ${formatDate(updated)}`));
  if (empty !== undefined && isEmpty?.(data.data) === true) {
    return (
      <Panel {...panel} meta={line}>
        <PanelEmpty {...empty} />
      </Panel>
    );
  }
  return (
    <Panel {...panel} meta={line} flush={flush}>
      {children(data.data)}
    </Panel>
  );
}
