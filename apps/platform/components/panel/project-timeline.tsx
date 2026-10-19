import type { ReactElement, ReactNode } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { cn } from "@brandbasket/shared/lib/cn";

export interface TimelineStage {
  readonly title: string;
  readonly detail: string;
}

interface ProjectTimelineProps {
  readonly stages: readonly TimelineStage[];
  /** Index of the stage in progress. Everything before it is done; everything after is still to come. */
  readonly currentIndex: number;
  /** Extra content rendered under one stage's detail text, keyed by that stage's index in `stages`. */
  readonly extraByIndex?: Readonly<Partial<Record<number, ReactNode>>>;
}

/** The build, top to bottom. Done stages are ticked, the current one is marked, the rest wait. */
export function ProjectTimeline({ stages, currentIndex, extraByIndex }: ProjectTimelineProps): ReactElement {
  return (
    <ol className="relative space-y-8">
      {stages.map((stage, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
        const isLast = index === stages.length - 1;
        return (
          <li key={stage.title} className="relative flex gap-5">
            {isLast ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[1.1875rem] top-11 h-[calc(100%-0.5rem)] w-px",
                  state === "done" ? "bg-ink" : "bg-line",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                state === "done" && "bg-ink text-paper",
                state === "current" && "bg-accent-pale text-accent-deep ring-4 ring-accent-pale/60",
                state === "upcoming" && "border border-line bg-card text-ink-soft",
              )}
            >
              {state === "done" ? <TickIcon className="size-4" /> : index + 1}
            </span>
            <div className="pt-1.5">
              <p className={cn("font-serif text-xl", state === "upcoming" && "text-ink-soft")}>
                {stage.title}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "current" ? " (in progress)" : " (still to come)"}
                </span>
              </p>
              <p className="mt-1 max-w-xl leading-relaxed text-ink-soft">{stage.detail}</p>
              {extraByIndex?.[index] ?? null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
