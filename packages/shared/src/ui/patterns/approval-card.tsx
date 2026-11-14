import type { ReactElement, ReactNode } from "react";

export interface ApprovalCardProps {
  readonly title: string;
  readonly category: string;
  readonly description?: string;
  readonly previewContent?: ReactNode;
  readonly revisionNote?: string;
  readonly onApprove: () => void;
  readonly onRequestChanges: () => void;
  readonly approveLabel?: string;
  readonly requestChangesLabel?: string;
  readonly isSubmitting?: boolean;
  readonly className?: string;
}

/**
 * ApprovalCard: standardized card for approving drafts, previews, post pictures, or quotes.
 */
export function ApprovalCard({
  title,
  category,
  description,
  previewContent,
  revisionNote,
  onApprove,
  onRequestChanges,
  approveLabel = "Approve",
  requestChangesLabel = "Request changes",
  isSubmitting = false,
  className = "",
}: ApprovalCardProps): ReactElement {
  return (
    <article
      className={`flex flex-col rounded-[14px] border border-border bg-surface p-6 shadow-card sm:p-7 ${className}`}
    >
      <header className="flex flex-col gap-1">
        <span className="font-sans text-xs font-semibold text-ink-3">{category}</span>
        <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1 font-sans text-sm text-ink-2">{description}</p> : null}
      </header>

      {previewContent ? <div className="mt-4 overflow-hidden rounded-[10px]">{previewContent}</div> : null}

      {revisionNote ? (
        <div className="mt-4 rounded-[8px] border border-border bg-canvas p-3 font-sans text-xs text-ink-2">
          <b>Changes status:</b> {revisionNote}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onApprove}
          className="inline-flex h-[42px] items-center justify-center rounded-[8px] bg-ink px-5 font-sans text-sm font-semibold text-white shadow-button hover:bg-primary-hover active:translate-y-[1px] disabled:opacity-50"
        >
          {approveLabel}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onRequestChanges}
          className="inline-flex h-[42px] items-center justify-center rounded-[8px] border border-border bg-surface px-5 font-sans text-sm font-semibold text-ink hover:bg-surface-hover active:translate-y-[1px] disabled:opacity-50"
        >
          {requestChangesLabel}
        </button>
      </div>
    </article>
  );
}
