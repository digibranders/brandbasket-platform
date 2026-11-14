import type { ReactElement, ReactNode } from "react";

export interface ErrorStateProps {
  readonly title: string;
  readonly message: string;
  readonly retryAction?: {
    readonly label: string;
    readonly onClick: () => void;
  };
  readonly secondaryAction?: ReactNode;
  readonly className?: string;
}

/**
 * ErrorState: explains what happened and states the next step clearly.
 */
export function ErrorState({
  title,
  message,
  retryAction,
  secondaryAction,
  className = "",
}: ErrorStateProps): ReactElement {
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-4 rounded-[14px] border border-neg-border bg-neg-wash p-6 text-left ${className}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-neg-text"
          aria-hidden="true"
        >
          <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <h3 className="font-sans text-base font-semibold text-neg-text">{title}</h3>
      </div>
      <p className="font-sans text-sm text-ink">{message}</p>
      {retryAction || secondaryAction ? (
        <div className="mt-1 flex items-center gap-3">
          {retryAction ? (
            <button
              type="button"
              onClick={retryAction.onClick}
              className="inline-flex h-9 items-center justify-center rounded-[8px] bg-ink px-4 font-sans text-[13.5px] font-semibold text-white shadow-button hover:bg-primary-hover active:translate-y-[1px]"
            >
              {retryAction.label}
            </button>
          ) : null}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
