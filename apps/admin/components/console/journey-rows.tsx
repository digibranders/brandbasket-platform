import Link from "next/link";
import type { ReactElement } from "react";
import { JOURNEY_STAGE_LABELS, JOURNEY_STAGES, type Journey } from "@/lib/pipeline";
import { Avatar, ringFor } from "./avatar";
import { stageHref } from "./journey-map";

/** How many avatars a phone row shows before linking on to the full list. */
const ROW_CAPACITY = 8;

/** The Journey on a phone: the map can't fit, so each stage becomes a row of avatars you can swipe along. */
export function JourneyRows({ journey }: { readonly journey: Journey }): ReactElement {
  return (
    <div className="mt-8 md:hidden">
      {JOURNEY_STAGES.map((stage) => {
        const subjects = journey.byStage[stage];
        const shown = subjects.slice(0, ROW_CAPACITY);
        const more = subjects.length - shown.length;
        return (
          <section key={stage} aria-label={JOURNEY_STAGE_LABELS[stage]} className="border-t border-line py-5">
            <Link href={stageHref(stage)} className="flex items-baseline gap-3">
              <span className="font-serif text-2xl leading-none tabular-nums">{subjects.length}</span>
              <span className="text-sm font-medium text-ink-soft">{JOURNEY_STAGE_LABELS[stage]}</span>
            </Link>
            {subjects.length === 0 ? null : (
              <ul className="-mx-5 mt-3 flex gap-4 overflow-x-auto px-5 py-2 [scrollbar-width:none]">
                {shown.map((subject) => (
                  <li key={subject.id} className="journey-spot shrink-0" data-attention={subject.attention === null ? "false" : "true"}>
                    <Link href={subject.href} className="flex w-16 flex-col items-center gap-2 text-center">
                      <Avatar id={subject.id} name={subject.name} ring={ringFor(subject.attention?.kind)} />
                      <span className="line-clamp-2 text-[0.7rem] leading-tight text-ink-soft">{subject.name}</span>
                    </Link>
                  </li>
                ))}
                {more > 0 ? (
                  <li className="shrink-0">
                    <Link
                      href={stageHref(stage)}
                      className="grid size-10 place-items-center rounded-full bg-paper-deep text-[0.8rem] font-semibold tabular-nums text-ink-soft"
                    >
                      +{more}
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
