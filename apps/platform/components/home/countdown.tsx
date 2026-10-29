"use client";

import { useEffect, useState, type ReactElement } from "react";
import { countdownBlocks, countdownLabel } from "@/lib/home/countdown";

/**
 * The time left to a call: whole days and hours, hours and minutes, or minutes, never seconds. It refreshes every 30 seconds
 * from the page's own clock (the server's time at first, so the page and the browser agree on the first draw), and is a
 * timer that does not announce each tick: a screen reader gets the sentence in its label.
 */
export function Countdown({ startsAtMs, nowMs }: { readonly startsAtMs: number; readonly nowMs: number }): ReactElement {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const offset = nowMs - Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset), 30_000);
    return () => window.clearInterval(id);
  }, [nowMs]);
  const left = startsAtMs - now;
  const blocks = countdownBlocks(left);
  return (
    <div role="timer" aria-live="off" aria-label={left < 60_000 ? "The call is starting now" : `The call starts in ${countdownLabel(left)}`} className="flex gap-2.5">
      {blocks.length === 0 ? (
        <span className="rounded-control bg-sunken px-4 py-3 font-display text-lg font-semibold text-ink">Starting now</span>
      ) : (
        blocks.map((block) => (
          <span key={block.unit} aria-hidden="true" className="grid min-w-[5.5rem] gap-0.5 rounded-control bg-sunken px-4 py-3">
            <span className="font-figure text-[1.75rem] font-semibold leading-none tabular-nums text-ink">{block.value}</span>
            <span className="text-[0.8125rem] text-ink-3">{block.unit}{block.value === 1 ? "" : "s"}</span>
          </span>
        ))
      )}
    </div>
  );
}
