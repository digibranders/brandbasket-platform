import type { ReactElement, ReactNode } from "react";
import { StatusChip } from "./status-chip";

export interface NextActionCardProps {
  readonly serviceName: string;
  readonly serviceIcon: ReactNode;
  readonly serviceBadge?: string;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly primaryAction: {
    readonly label: string;
    readonly onClick?: () => void;
    readonly href?: string;
    readonly disabled?: boolean;
  };
  readonly secondaryAction?: ReactNode;
  readonly asideNote?: string;
  readonly statusText?: string;
  readonly statusTone?: "waiting" | "active" | "error";
  readonly className?: string;
}

/**
 * NextActionCard: the single focal card on the screen.
 * 20px radius, 3px gold top border, 40px icon tile with gold wash, elevated warm shadow.
 * Only one focal card per screen viewport.
 */
export function NextActionCard({
  serviceName,
  serviceIcon,
  serviceBadge,
  title,
  description,
  children,
  primaryAction,
  secondaryAction,
  asideNote,
  statusText,
  statusTone = "waiting",
  className = "",
}: NextActionCardProps): ReactElement {
  return (
    <article
      className={`relative flex flex-col rounded-[20px] border border-border border-t-[3px] border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7 ${className}`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-accent-wash text-accent-text">
          {serviceIcon}
        </span>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{serviceName}</h2>
          {serviceBadge ? <StatusChip label={serviceBadge} variant="active" /> : null}
        </div>
        <div className="ml-auto">
          <StatusChip label="Next step" variant="next" />
        </div>
      </header>

      <div className="mt-5">
        <h3 className="font-display text-[22px] font-semibold leading-7 tracking-tight text-ink sm:text-[26px] sm:leading-8">
          {title}
        </h3>
        <p className="mt-1.5 font-sans text-[15px] leading-6 text-ink-2">{description}</p>
      </div>

      {children ? <div className="mt-5">{children}</div> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {primaryAction.href ? (
          <a
            href={primaryAction.href}
            className="inline-flex h-[42px] items-center justify-center rounded-[8px] bg-ink px-5 font-sans text-sm font-semibold text-white shadow-button hover:bg-primary-hover active:translate-y-[1px]"
          >
            {primaryAction.label}
          </a>
        ) : (
          <button
            type="button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            className="inline-flex h-[42px] items-center justify-center rounded-[8px] bg-ink px-5 font-sans text-sm font-semibold text-white shadow-button hover:bg-primary-hover active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryAction.label}
          </button>
        )}
        {secondaryAction}
        {asideNote ? (
          <span className="font-sans text-[13px] text-ink-3">{asideNote}</span>
        ) : null}
      </div>

      {statusText ? (
        <footer className="mt-6 flex items-center gap-2.5 border-t border-border pt-4 text-sm text-ink-2">
          <b className="font-semibold text-ink">Status</b>
          <span
            className={`h-2 w-2 rounded-full ${
              statusTone === "active"
                ? "bg-pos-text"
                : statusTone === "error"
                  ? "bg-neg-text"
                  : "bg-accent-gold"
            }`}
            aria-hidden="true"
          />
          <span className="font-sans text-sm">{statusText}</span>
        </footer>
      ) : null}
    </article>
  );
}
