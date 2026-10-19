import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export interface FigureItem {
  readonly value: ReactNode;
  readonly label: string;
  /** A short qualifier under the label. */
  readonly note?: string;
  readonly emphasis?: boolean;
  /** A figure that can run long, such as rupees with paise: set a step smaller and allowed to wrap, so it never runs into the next one. */
  readonly long?: boolean;
}

/** Big numbers in a row, separated by space alone. The figure carries the weight; the words stay small. */
export function Figures({ items }: { readonly items: readonly FigureItem[] }): ReactElement {
  return (
    <div className="mt-8 flex flex-wrap gap-x-14 gap-y-6">
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.long ? "max-w-full" : "max-w-[16rem]")}>
          <p
            className={cn(
              "font-serif leading-none tracking-[-0.02em] tabular-nums",
              item.long ? "break-words text-[2rem] sm:text-[2.25rem]" : "text-[2.75rem]",
              item.emphasis && "text-accent",
            )}
          >
            {item.value}
          </p>
          <p className="mt-2 text-sm font-medium text-ink-soft">{item.label}</p>
          {item.note === undefined ? null : <p className="mt-0.5 text-sm text-ink-soft/80">{item.note}</p>}
        </div>
      ))}
    </div>
  );
}
