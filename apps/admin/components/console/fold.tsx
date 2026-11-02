import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon } from "@brandbasket/shared/ui/icons";

interface FoldProps {
  readonly title: string;
  /** A small figure beside the title, such as how many rows are inside. */
  readonly count?: number;
  /** Open on first paint. A fold closes again on the next visit; nothing is remembered. */
  readonly open?: boolean;
  readonly children: ReactNode;
}

/** A part of a page that stays shut until asked for: a title on a hairline, then the content. Native details and summary. */
export function Fold({ title, count, open = false, children }: FoldProps): ReactElement {
  return (
    <details open={open} className="group border-b border-line">
      <summary className="console-motion flex cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
          {title}
          {count === undefined ? null : <span className="ml-2 font-figure text-xs font-normal tabular-nums text-ink-2">{count}</span>}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-ink-2 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="min-w-0 pb-5">{children}</div>
    </details>
  );
}
