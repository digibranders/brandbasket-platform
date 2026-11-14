import type { ReactElement, ReactNode } from "react";

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * EmptyState: calm, informative empty state.
 * Says what will appear here and when, with no exclamation marks or emoji.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border bg-canvas px-6 py-10 text-center ${className}`}
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-pos-text">
          {icon}
        </div>
      ) : null}
      <h3 className="font-sans text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md font-sans text-sm text-ink-2">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
