import type { ReactElement, ReactNode } from "react";

export interface PageHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * PageHeader: standard header block matching section 5 of the design language.
 * Small muted label, page title 36px (28px mobile), one-line context, actions on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: PageHeaderProps): ReactElement {
  return (
    <header className={`flex flex-col gap-3 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <span className="font-sans text-xs font-semibold text-ink-3">{eyebrow}</span>
        ) : null}
        <h1 className="type-title text-ink">{title}</h1>
        {description ? <p className="font-sans text-[15px] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3 pt-2 md:pt-0">{actions}</div> : null}
    </header>
  );
}
