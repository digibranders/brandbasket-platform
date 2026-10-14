import type { ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { JOURNEY_STAGE_LABELS, JOURNEY_STAGES, type JourneyStage } from "@/lib/pipeline";

type TrackStage = JourneyStage | "paused";

function positionOf(stage: TrackStage): number {
  return stage === "paused" ? -1 : JOURNEY_STAGES.indexOf(stage);
}

function describe(stage: TrackStage): string {
  return stage === "paused"
    ? "Paused"
    : `${JOURNEY_STAGE_LABELS[stage]}, step ${positionOf(stage) + 1} of ${JOURNEY_STAGES.length}`;
}

/**
 * The five stages with this client's place marked: done in burgundy, now in gold-deep (bright gold is under 1.5:1 on
 * cream), still to come left open as a ring. Every mark is at least 3:1 on paper.
 */
export function StageTrack({ stage }: { readonly stage: TrackStage }): ReactElement {
  const current = positionOf(stage);
  return (
    <div role="img" aria-label={`Journey: ${describe(stage)}`} className="mt-8 max-w-2xl">
      <ol
        aria-hidden="true"
        className="grid"
        style={{ gridTemplateColumns: `repeat(${JOURNEY_STAGES.length}, minmax(0, 1fr))` }}
      >
        {JOURNEY_STAGES.map((step, index) => {
          const done = current > index;
          const now = current === index;
          return (
            <li key={step} className="relative pt-7">
              <span
                className={cn(
                  "absolute left-0 right-0 top-[0.6875rem] h-0.5",
                  index === JOURNEY_STAGES.length - 1 && "right-auto w-0",
                  done ? "bg-accent" : "bg-line",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 top-1.5 size-3 rounded-full",
                  done && "bg-accent",
                  now && "bg-gold-deep ring-4 ring-gold/30",
                  !done && !now && "bg-paper ring-2 ring-inset ring-ink-soft/65",
                )}
              />
              <span className={cn("block text-sm", now ? "font-semibold text-ink" : "text-ink-soft")}>
                {JOURNEY_STAGE_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>
      {stage === "paused" ? <p className="mt-3 text-sm font-medium text-accent">Paused</p> : null}
    </div>
  );
}

/** Five small dots for list rows. */
export function MiniTrack({ stage }: { readonly stage: TrackStage }): ReactElement {
  const current = positionOf(stage);
  return (
    <span role="img" aria-label={describe(stage)} className="inline-flex items-center gap-1.5">
      {JOURNEY_STAGES.map((step, index) => (
        <span
          key={step}
          className={cn(
            "size-2 rounded-full",
            current > index && "bg-accent",
            current === index && "bg-gold-deep ring-[3px] ring-gold/30",
            current < index && "ring-[1.5px] ring-inset ring-ink-soft/65",
          )}
        />
      ))}
    </span>
  );
}
