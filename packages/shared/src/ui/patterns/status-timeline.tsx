import type { ReactElement } from "react";

export interface TimelineEntry {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly timestamp?: string;
  readonly state: "done" | "current" | "upcoming";
}

export interface StatusTimelineProps {
  readonly entries: readonly TimelineEntry[];
  readonly className?: string;
}

/**
 * StatusTimeline: vertical workflow timeline showing past, current and upcoming milestones.
 */
export function StatusTimeline({
  entries,
  className = "",
}: StatusTimelineProps): ReactElement {
  return (
    <div className={`flex flex-col ${className}`} role="list">
      {entries.map((entry, idx) => {
        const isDone = entry.state === "done";
        const isCurrent = entry.state === "current";
        const isLast = idx === entries.length - 1;

        return (
          <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0" role="listitem">
            {!isLast ? (
              <span
                className={`absolute top-4 left-3 h-full w-[1px] -translate-x-1/2 ${
                  isDone ? "bg-pos-text" : "bg-border"
                }`}
                aria-hidden="true"
              />
            ) : null}
            <div className="relative z-10 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface">
              {isDone ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pos-wash text-pos-text">
                  <svg className="h-3.5 w-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : isCurrent ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-accent-gold bg-accent-wash">
                  <span className="h-2 w-2 rounded-full bg-accent-gold" />
                </span>
              ) : (
                <span className="h-3 w-3 rounded-full border border-border bg-surface-hover" />
              )}
            </div>
            <div className="flex flex-1 flex-col pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-sans text-sm ${
                    isCurrent ? "font-semibold text-ink" : isDone ? "font-semibold text-pos-text" : "font-medium text-ink-2"
                  }`}
                >
                  {entry.title}
                </span>
                {entry.timestamp ? (
                  <span className="font-mono text-xs text-ink-3 tabular-nums">{entry.timestamp}</span>
                ) : null}
              </div>
              {entry.description ? (
                <p className="mt-1 font-sans text-[13px] text-ink-2">{entry.description}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
