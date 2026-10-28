import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/**
 * The cards of a record page: a titled panel and a stat card. Used where a page is a profile with several things on it
 * (an affiliate), so each part reads as its own block. Lists and forms elsewhere in the console stay on the page with a
 * hairline (apps/admin/DESIGN.md "Surfaces").
 */

const CARD = "rounded-lift bg-surface shadow-lift ring-1 ring-line/70";

interface PanelProps {
  readonly title: string;
  readonly children: ReactNode;
  /** A count shown beside the title. */
  readonly count?: number;
  /** A button or link at the right of the title row. */
  readonly action?: ReactNode;
  /** One quiet line under the title. */
  readonly description?: string;
  /** "attention" tints the header: the one panel that needs dealing with. */
  readonly tone?: "plain" | "attention";
  /** The body has no padding, because it holds a table that pads its own cells. */
  readonly flush?: boolean;
  readonly id?: string;
}

export function Panel({ title, children, count, action, description, tone = "plain", flush = false, id }: PanelProps): ReactElement {
  const headingId = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn(CARD, "min-w-0 scroll-mt-8 overflow-hidden")}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4", tone === "attention" && "bg-rattan-wash")}>
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
            {title}
            {count === undefined ? null : (
              <span className="rounded-md bg-sunken px-1.5 py-0.5 font-figure text-xs font-medium tabular-nums text-ink-2">{count}</span>
            )}
          </h2>
          {description === undefined ? null : <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
        </div>
        {action === undefined ? null : <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      <div className={cn("border-t border-line", flush ? null : "px-5 py-5")}>{children}</div>
    </section>
  );
}

/** What a panel says when it has nothing in it: one sentence, centred in the card. */
export function PanelEmpty({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="px-5 py-8 text-center text-sm text-ink-2">{children}</p>;
}

interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** A short qualifier under the value. */
  readonly note?: string;
  /** The icon in its tile: decorative, the label names the stat. */
  readonly icon: ReactElement;
  /** Money waiting on us: the value and the tile take the accent. */
  readonly emphasis?: boolean;
  /** A value that can run long, such as two currencies added together. */
  readonly long?: boolean;
}

export function StatCard({ label, value, note, icon, emphasis = false, long = false }: StatCardProps): ReactElement {
  return (
    <div className={cn(CARD, "min-w-0 p-4")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{label}</p>
        <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg", emphasis ? "bg-rattan-wash text-rattan-ink" : "bg-sunken text-ink-2")}>
          {icon}
        </span>
      </div>
      <p className={cn("mt-3 break-words font-figure leading-none tracking-[-0.04em] tabular-nums", long ? "text-lg sm:text-xl" : "text-[1.625rem]", emphasis ? "text-rattan-text" : "text-ink")}>{value}</p>
      {note === undefined ? null : <p className="mt-2 text-xs text-ink-2">{note}</p>}
    </div>
  );
}

/** Table cells inside a flush panel: the first and last cell pad to the card's edge. */
export const PANEL_TABLE = "w-full border-collapse text-[0.84375rem]";
export const PANEL_TH = "whitespace-nowrap bg-sunken/60 px-3 py-2 text-left text-xs font-semibold text-ink-2 first:pl-5 last:pr-5";
export const PANEL_TH_NUM = `${PANEL_TH} text-right`;
export const PANEL_TD = "border-t border-line px-3 py-3 align-middle first:pl-5 last:pr-5";
export const PANEL_TD_NUM = `${PANEL_TD} text-right font-figure tabular-nums`;
export const PANEL_TD_TIME = `${PANEL_TD} whitespace-nowrap font-figure text-xs text-ink-2`;
