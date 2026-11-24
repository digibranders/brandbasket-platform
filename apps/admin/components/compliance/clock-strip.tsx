import type { ReactElement } from "react";
import type { ClockItem } from "@/lib/compliance-model";
import { ClockChip } from "./clock-chip";

export interface ClockStripProps {
  readonly items: readonly ClockItem[];
  readonly running: number;
  /** Registers that could not be read, named for the notice. */
  readonly unread: readonly string[];
}

/**
 * The clocks that need staff first, on all four Compliance tabs: the most overdue running clocks across privacy requests and
 * breaches. A register that could not be read is said so; its clocks keep running regardless.
 */
export function ClockStrip({ items, running, unread }: ClockStripProps): ReactElement {
  const hot = items.some((item) => item.tone === "late");
  return (
    <div
      role="status"
      aria-label="Clocks"
      className={`mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border px-5 py-3.5 ${hot ? "border-neg-border bg-neg-wash" : "border-line bg-surface"}`}
    >
      {items.length === 0 && unread.length === 0 ? (
        <>
          <b className="text-sm">No clocks are running.</b>
          <span className="text-sm text-ink-2">A privacy request or a breach starts a clock the moment it is logged.</span>
        </>
      ) : (
        <>
          {items.length === 0 ? null : <b className="text-sm">Clocks that need you first</b>}
          {items.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-2 text-sm">
              <span className="text-ink-2">{item.label}</span>
              <ClockChip text={item.text} tone={item.tone} />
            </span>
          ))}
          {running > items.length ? <span className="text-sm text-ink-2">and {running - items.length} more running</span> : null}
          {unread.length === 0 ? null : (
            <span className="text-sm font-medium text-error">
              The {unread.join(" and ")} could not be read, so their clocks are not shown. They keep running.
            </span>
          )}
        </>
      )}
    </div>
  );
}
