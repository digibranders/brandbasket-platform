import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { BackLink } from "./back-link";

interface PageHeaderProps {
  /** The page's title, in the display face. */
  readonly title: ReactNode;
  readonly back?: { readonly href: string; readonly label: string };
  /** An avatar or mark shown before the title on record pages. */
  readonly lead?: ReactElement;
  /** One quiet line under the title: who, where, when, how many. */
  readonly meta?: ReactNode;
  /** The page's actions, top right. At most one of them is the dark button. */
  readonly action?: ReactNode;
  /** Anything that belongs to the header itself, such as a stage track. */
  readonly children?: ReactNode;
}

export function PageHeader({ title, back, lead, meta, action, children }: PageHeaderProps): ReactElement {
  return (
    <header>
      {back === undefined ? null : <BackLink href={back.href} label={back.label} />}
      <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", back !== undefined && "mt-4")}>
        <div className="flex min-w-0 items-center gap-4">
          {lead}
          <div className="min-w-0">
            <h1 className="font-display text-[1.625rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">{title}</h1>
            {meta === undefined ? null : <p className="mt-1.5 text-sm tabular-nums text-ink-2">{meta}</p>}
          </div>
        </div>
        {action === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </header>
  );
}
