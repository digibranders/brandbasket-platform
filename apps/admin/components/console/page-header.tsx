import type { ReactElement, ReactNode } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { BackLink } from "./back-link";

interface PageHeaderProps {
  /** Newsreader headline. Wrap a phrase in `<em>` for the italic burgundy emphasis. */
  readonly title: ReactNode;
  readonly back?: { readonly href: string; readonly label: string };
  /** An avatar or mark shown before the title on record pages. */
  readonly lead?: ReactNode;
  /** One quiet line under the title: who, where, when. */
  readonly meta?: ReactNode;
  /** The page's primary action, top right. */
  readonly action?: ReactNode;
  /** Anything that belongs to the header itself, such as a stage track. */
  readonly children?: ReactNode;
}

export function PageHeader({ title, back, lead, meta, action, children }: PageHeaderProps): ReactElement {
  return (
    <header>
      {back === undefined ? null : <BackLink href={back.href} label={back.label} />}
      <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-5", back !== undefined && "mt-5")}>
        <div className="flex min-w-0 items-center gap-5">
          {lead}
          <div className="min-w-0">
            <h1 className="heading-display text-[clamp(2.25rem,5vw,3.25rem)] font-normal">{title}</h1>
            {meta === undefined ? null : <p className="mt-2 text-sm tabular-nums text-ink-soft">{meta}</p>}
          </div>
        </div>
        {action === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
      </div>
      {children}
    </header>
  );
}
