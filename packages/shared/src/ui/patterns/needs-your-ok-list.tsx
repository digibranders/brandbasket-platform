import type { ReactElement, ReactNode } from "react";

export interface NeedsOkItem {
  readonly id: string;
  readonly title: string;
  readonly context: string;
  readonly age?: string;
  readonly icon?: ReactNode;
  readonly onAction?: () => void;
  readonly actionLabel?: string;
  readonly href?: string;
}

export interface NeedsYourOkListProps {
  readonly title?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly items: readonly NeedsOkItem[];
  readonly onViewAll?: () => void;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * NeedsYourOkList: section in a card collecting items waiting for the customer.
 * 40px icon tile, bold title, one-line context, age in Mono, single action button.
 */
export function NeedsYourOkList({
  title,
  emptyTitle,
  emptyDescription,
  items,
  onViewAll,
  className = "",
  children,
}: NeedsYourOkListProps): ReactElement {
  const count = items.length;

  return (
    <aside
      aria-labelledby="needs-ok-title"
      className={`flex flex-col rounded-[14px] border border-border bg-surface p-6 shadow-card ${className}`}
    >
      <header className="flex items-center justify-between pb-3">
        <h2
          id="needs-ok-title"
          aria-label="Needs you: Needs your OK"
          className="font-display text-lg font-semibold text-ink"
        >
          {title ?? "Needs your OK"}
        </h2>
        <span className="rounded-full bg-accent-wash px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-text tabular-nums">
          {count}
        </span>
      </header>

      {count === 0 ? (
        <div className="mt-2 flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-canvas px-4 py-8 text-center">
          <svg className="h-6 w-6 text-pos-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-2 font-sans text-sm font-semibold text-ink">
            {emptyTitle ?? "Nothing needs your OK right now."}
          </p>
          <span className="sr-only">Nothing needed from you right now</span>
          <span className="mt-1 font-sans text-xs text-ink-3">
            {emptyDescription ?? "Previews, post pictures and quotes appear here and in the bell."}
          </span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border pt-1" role="list">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3.5 first:pt-2 last:pb-1" role="listitem">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-accent-wash text-accent-text">
                {item.icon ? (
                  item.icon
                ) : (
                  <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <b className="truncate font-sans text-sm font-semibold text-ink">{item.title}</b>
                <div className="flex items-center gap-2">
                  <span className="truncate font-sans text-xs text-ink-2">{item.context}</span>
                  {item.age ? (
                    <span className="font-mono text-[11px] text-ink-3 tabular-nums">{item.age}</span>
                  ) : null}
                </div>
              </div>
              {item.href ? (
                <a
                  href={item.href}
                  className="inline-flex h-[34px] items-center justify-center rounded-[8px] bg-ink px-3.5 font-sans text-xs font-semibold text-white hover:bg-primary-hover active:translate-y-[1px]"
                >
                  {item.actionLabel ?? "Review"}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={item.onAction}
                  className="inline-flex h-[34px] items-center justify-center rounded-[8px] bg-ink px-3.5 font-sans text-xs font-semibold text-white hover:bg-primary-hover active:translate-y-[1px]"
                >
                  {item.actionLabel ?? "Review"}
                </button>
              )}
            </div>
          ))}
          {onViewAll && count > 3 ? (
            <div className="pt-4">
              <button
                type="button"
                onClick={onViewAll}
                className="font-sans text-sm font-semibold text-ink underline decoration-accent-gold underline-offset-4"
              >
                Review all {count} items
              </button>
            </div>
          ) : null}
        </div>
      )}
      {children ? <div className="mt-4 border-t border-border pt-4">{children}</div> : null}
    </aside>
  );
}
