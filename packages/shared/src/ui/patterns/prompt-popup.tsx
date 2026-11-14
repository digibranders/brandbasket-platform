import type { ReactElement, ReactNode } from "react";

export interface PromptPopupProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
  readonly primaryAction?: {
    readonly label: string;
    readonly onClick: () => void;
    readonly disabled?: boolean;
  };
  readonly secondaryAction?: ReactNode;
  readonly className?: string;
}

/**
 * PromptPopup: dialog component designed for staff workflow actions (e.g. kickoff call confirmation).
 * 20px radius, 28px padding, dialog shadow over warm scrim.
 */
export function PromptPopup({
  isOpen,
  title,
  description,
  onClose,
  children,
  primaryAction,
  secondaryAction,
  className = "",
}: PromptPopupProps): ReactElement | null {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-popup-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-[#15161A]/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 w-full max-w-[560px] rounded-[20px] border border-border bg-surface p-7 shadow-dialog ${className}`}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="prompt-popup-title" className="font-display text-[22px] font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 font-sans text-sm text-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-hover hover:text-ink"
          >
            <svg className="h-4 w-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="mt-5">{children}</div>

        {primaryAction || secondaryAction ? (
          <footer className="mt-7 flex items-center justify-end gap-3 border-t border-border pt-4">
            {secondaryAction}
            {primaryAction ? (
              <button
                type="button"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
                className="inline-flex h-[42px] items-center justify-center rounded-[8px] bg-ink px-5 font-sans text-sm font-semibold text-white shadow-button hover:bg-primary-hover active:translate-y-[1px] disabled:opacity-50"
              >
                {primaryAction.label}
              </button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
