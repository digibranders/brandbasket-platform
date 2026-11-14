import type { ReactElement, ReactNode } from "react";
import { StatusChip, type StatusChipVariant } from "./status-chip";

export interface ServiceCardProps {
  readonly serviceName: string;
  readonly serviceIcon: ReactNode;
  readonly statusLabel: string;
  readonly statusVariant?: StatusChipVariant;
  readonly statusHasDot?: boolean;
  readonly summary: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * ServiceCard: standard resting service card with 14px radius and quiet elevation.
 */
export function ServiceCard({
  serviceName,
  serviceIcon,
  statusLabel,
  statusVariant = "idle",
  statusHasDot,
  summary,
  action,
  children,
  className = "",
}: ServiceCardProps): ReactElement {
  return (
    <article
      className={`flex flex-col rounded-[14px] border border-border bg-surface p-6 shadow-card sm:p-7 ${className}`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-surface-hover text-ink">
            {serviceIcon}
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{serviceName}</h2>
        </div>
        <StatusChip
          label={statusLabel}
          variant={statusVariant}
          hasDot={statusHasDot ?? (statusVariant === "active")}
        />
      </header>

      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-2">{summary}</p>

      {children ? <div className="mt-4">{children}</div> : null}

      {action ? <div className="mt-5 flex items-center">{action}</div> : null}
    </article>
  );
}
