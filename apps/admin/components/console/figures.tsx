import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export interface FigureItem {
  readonly value: ReactNode;
  readonly label: string;
  /** A short qualifier under the value. */
  readonly note?: string;
  readonly emphasis?: boolean;
  /** A figure that can run long, such as rupees with paise: set a step smaller and allowed to wrap. */
  readonly long?: boolean;
  /** Colours the note: good news, something to watch, or something wrong. */
  readonly tone?: "good" | "warn" | "bad";
}

const NOTE_TONES: Readonly<Record<NonNullable<FigureItem["tone"]>, string>> = {
  good: "text-sage",
  warn: "text-rattan-ink",
  bad: "text-error",
};

/** The KPI line: figures side by side between two hairlines, label above, value in the figure face, note under. */
export function Figures({ items }: { readonly items: readonly FigureItem[] }): ReactElement {
  return (
    <div className="mt-5 grid grid-cols-2 border-y border-line sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
      {items.map((item) => (
        <div key={item.label} className="grid min-w-0 content-start gap-1 py-3 pr-3.5 lg:border-l lg:border-line lg:pl-3.5 lg:first:border-l-0 lg:first:pl-0">
          <p className="text-xs text-ink-2">{item.label}</p>
          <p className={cn("font-figure leading-none tracking-[-0.04em] tabular-nums", item.long ? "break-words text-xl" : "text-[1.625rem]", item.emphasis && "text-rattan-text")}>
            {item.value}
          </p>
          {item.note === undefined ? null : <p className={cn("text-xs font-semibold", item.tone === undefined ? "text-ink-2" : NOTE_TONES[item.tone])}>{item.note}</p>}
        </div>
      ))}
    </div>
  );
}
