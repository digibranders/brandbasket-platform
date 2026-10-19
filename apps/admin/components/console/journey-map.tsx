import Link from "next/link";
import type { CSSProperties, ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { pathD, placeBand } from "@/lib/journey-layout";
import { JOURNEY_STAGE_LABELS, JOURNEY_STAGES, type Journey, type JourneyStage, type JourneySubject } from "@/lib/pipeline";
import { Avatar, ringFor } from "./avatar";
import { HoverCard } from "./hover-card";

/** The SVG's own coordinate space; it stretches to the map's real size. */
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 470;
const PATH = pathD(VIEW_WIDTH, VIEW_HEIGHT);

/** Where "+N" and each band's count lead: the list that shows the whole stage. */
export function stageHref(stage: JourneyStage | "paused"): string {
  return stage === "lead" ? "/leads" : `/clients?stage=${stage}`;
}

/** Avatars below this height open their card upwards, clear of the dock. */
const OPEN_UPWARDS_BELOW_PCT = 55;

function spotStyle(leftPct: number, topPct: number, order: number): CSSProperties {
  return {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    // Centring uses `transform` so the entrance animation, which moves `translate`, can't knock it off the path.
    transform: "translate(-50%, -50%)",
    "--i": order,
  } as CSSProperties;
}

function attentionTag(subject: JourneySubject): string | null {
  if (subject.attention === null) return null;
  if (subject.attention.kind === "payment") return "Payment";
  if (subject.attention.kind === "add-on") return "Add-on";
  if (subject.attention.kind === "overdue") return subject.attention.reason.replace("Preview ", "");
  return null;
}

function Spot({
  subject,
  leftPct,
  topPct,
  order,
  lastBand,
}: {
  readonly subject: JourneySubject;
  readonly leftPct: number;
  readonly topPct: number;
  readonly order: number;
  readonly lastBand: boolean;
}): ReactElement {
  const ring = ringFor(subject.attention?.kind);
  const tag = attentionTag(subject);
  const description = [subject.name, subject.statusLabel, subject.attention?.reason].filter(Boolean).join(", ");
  return (
    <div
      className="journey-spot journey-rise group absolute z-10 hover:z-20 focus-within:z-20"
      data-attention={subject.attention === null ? "false" : "true"}
      style={spotStyle(leftPct, topPct, order)}
    >
      <Link
        href={subject.href}
        aria-label={description}
        className="block rounded-full shadow-[0_0_0_4px_var(--color-paper),0_12px_24px_-12px_rgba(42,13,16,0.55)] transition-transform duration-300 ease-calm hover:scale-110 focus-visible:scale-110"
      >
        <Avatar id={subject.id} name={subject.name} ring={ring} />
      </Link>
      {tag === null ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 top-[calc(100%+0.55rem)] -translate-x-1/2 whitespace-nowrap text-[0.7rem] font-bold",
            ring === "money" ? "text-gold-ink" : "text-accent",
          )}
        >
          {tag}
        </span>
      )}
      <HoverCard subject={subject} side={lastBand ? "left" : "right"} above={topPct > OPEN_UPWARDS_BELOW_PCT} />
    </div>
  );
}

/**
 * The home screen: five stages across the page, a dotted path through them, and every client sitting on the path in
 * its stage. Rings mark who needs us. Each band shows a handful and folds the rest into "+N", with anyone needing
 * attention always among those shown.
 */
export function JourneyMap({ journey }: { readonly journey: Journey }): ReactElement {
  const bands = JOURNEY_STAGES.map((stage, band) => ({
    stage,
    band,
    ...placeBand(journey.byStage[stage], band, JOURNEY_STAGES.length),
  }));
  // Each band's first entrance delay, so avatars arrive left to right across the whole map.
  const firstOrder = bands.map((_, index) =>
    bands.slice(0, index).reduce((count, previous) => count + previous.placed.length + (previous.overflowAt === null ? 0 : 1), 0),
  );
  return (
    <div className="relative mt-10 hidden h-[clamp(22rem,56vh,30rem)] md:block">
      {JOURNEY_STAGES.map((stage, band) => (
        <div
          key={stage}
          className={cn("absolute inset-y-0 pl-4", band > 0 && "border-l border-dashed border-line")}
          style={{ left: `${(band * 100) / JOURNEY_STAGES.length}%`, width: `${100 / JOURNEY_STAGES.length}%` }}
        >
          <Link href={stageHref(stage)} className="group/band inline-block rounded-xl pr-2">
            <span className="block font-serif text-[1.75rem] leading-none tracking-[-0.02em] tabular-nums text-ink transition-colors duration-300 ease-calm group-hover/band:text-accent">
              {journey.byStage[stage].length}
            </span>
            <span className="mt-1 block text-sm font-medium text-ink-soft">{JOURNEY_STAGE_LABELS[stage]}</span>
          </Link>
        </div>
      ))}

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <path
          d={PATH}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.5 11"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {bands.map(({ stage, band, placed, overflow, overflowAt }) => {
        const start = firstOrder[band] ?? 0;
        return (
          <div key={stage}>
            {placed.map((spot, index) => (
              <Spot
                key={spot.item.id}
                subject={spot.item}
                leftPct={spot.leftPct}
                topPct={spot.topPct}
                order={start + index}
                lastBand={band === JOURNEY_STAGES.length - 1}
              />
            ))}
            {overflowAt === null ? null : (
              <div
                className="journey-spot journey-rise absolute z-10"
                data-attention="false"
                style={spotStyle(overflowAt.leftPct, overflowAt.topPct, start + placed.length)}
              >
                <Link
                  href={stageHref(stage)}
                  aria-label={`${overflow} more in ${JOURNEY_STAGE_LABELS[stage]}`}
                  className="grid size-10 place-items-center rounded-full bg-paper-deep text-[0.8rem] font-semibold tabular-nums text-ink-soft shadow-[0_0_0_4px_var(--color-paper)] transition-[transform,color] duration-300 ease-calm hover:scale-110 hover:text-ink"
                >
                  +{overflow}
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
