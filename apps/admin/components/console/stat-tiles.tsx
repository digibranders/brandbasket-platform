import type { ReactElement } from "react";
import { StatTile, type StatTileTone } from "@brandbasket/shared/ui/patterns";
import type { FigureItem } from "./figures";

const TONES: Readonly<Record<NonNullable<FigureItem["tone"]>, StatTileTone>> = {
  good: "positive",
  warn: "warning",
  bad: "negative",
};

/**
 * The figures of a screen as shared StatTiles on one resting card. Takes the same items as `Figures`, so a page swaps
 * one for the other. Red is only for a `bad` note, which a page sets for late or failed work.
 */
export function StatTiles({ items, label }: { readonly items: readonly FigureItem[]; readonly label?: string }): ReactElement {
  return (
    <section
      aria-label={label ?? "Figures"}
      className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-[14px] border border-line bg-surface p-5 shadow-card sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
    >
      {items.map((item) => (
        <StatTile
          key={item.label}
          label={item.label}
          value={typeof item.value === "number" || typeof item.value === "string" ? item.value : String(item.value)}
          note={item.note}
          deltaTone={item.tone === undefined ? (item.emphasis === true ? "warning" : "neutral") : TONES[item.tone]}
          size={item.long === true ? "medium" : "large"}
        />
      ))}
    </section>
  );
}
