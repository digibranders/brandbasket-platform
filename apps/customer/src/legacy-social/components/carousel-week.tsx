"use client";

import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { dayLabel, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { CAROUSEL_STATUS_WORDS, carouselDrawn, carouselSlideUrl, type CarouselDetail, type CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction, drawCarouselAction } from "@/legacy-social/review-actions";
import { WorkingNote } from "./job-progress";
import { SMALL_DARK, SMALL_WHITE } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

/** The weekly carousel as the week screen needs it: where it stands, and it in full when it could be read. */
export interface WeekCarousel {
  readonly summary: CarouselSummary;
  readonly detail: CarouselDetail | null;
  /** False for a viewer, who may look but not decide. */
  readonly canChange: boolean;
}

/** Whether the carousel is for a day inside the week being looked at (`from` and `to` are `YYYY-MM-DD`). */
export const carouselInWeek = (carousel: WeekCarousel | null, from: string, to: string): carousel is WeekCarousel =>
  carousel !== null && carousel.summary.date !== null && from !== "" && carousel.summary.date >= from && carousel.summary.date <= to;

/**
 * Whether the carousel is for this channel. It is the same carousel on every channel it was written for, so each of those channels shows it;
 * when the posting service does not say which channels it was written for, every channel does.
 */
export const carouselFor = (carousel: WeekCarousel, channel: "all" | ChannelPlatform): boolean => channel === "all" || carousel.detail === null || carousel.detail.captions.length === 0 || carousel.detail.captions.some((caption) => caption.network === channel);

/** The headlines of the slides: from the list answer when it has them, else from the slides of the detail. */
export function slideHeadlines(carousel: WeekCarousel): { readonly position: number; readonly headline: string }[] {
  const fromList = carousel.summary.headlines.flatMap((headline, index) => (headline === "" ? [] : [{ position: index + 1, headline }]));
  if (fromList.length > 0) return fromList;
  return (carousel.detail?.slides ?? []).flatMap((slide) => (slide.headline === undefined ? [] : [{ position: slide.position, headline: slide.headline }]));
}

/** What the customer has decided about the carousel, in the words the other topics use. */
export const decisionOf = (summary: CarouselSummary): { readonly word: string; readonly tone: string } => {
  const word = CAROUSEL_STATUS_WORDS[summary.status];
  if (summary.status === "kept" || summary.status === "approved") return { word, tone: "font-semibold text-ok" };
  if (summary.status === "dropped" || summary.status === "rejected") return { word, tone: "text-ink-3" };
  return { word, tone: "font-semibold text-warn" };
};

/** The reason a carousel is sent back with when she does not say: the posting service's own "other". */
export const sendBackReason = (detail: CarouselDetail | null): string => (detail !== null && detail.reasons.length > 0 && !detail.reasons.includes("other") ? (detail.reasons[0] ?? "other") : "other");

/** The choices for a carousel as buttons: keep or drop its topic, undo that, and approve or send back the drawn slides. */
function Choices({ carousel }: { readonly carousel: WeekCarousel }): ReactElement | null {
  const { summary, detail, canChange } = carousel;
  const decide = useReviewAction();
  if (!canChange) return null;
  const run = (action: "keep" | "drop" | "reset" | "approve"): void => decide.run(decideCarouselAction, { id: summary.id, action });
  const sendBack = (): void => decide.run(decideCarouselAction, { id: summary.id, action: "reject", reason: sendBackReason(detail) });
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {summary.status === "topic" ? (
          <>
            <button type="button" disabled={decide.pending} onClick={() => run("keep")} className={SMALL_DARK}>
              Keep
            </button>
            <button type="button" disabled={decide.pending} onClick={() => run("drop")} className={SMALL_WHITE}>
              Drop
            </button>
          </>
        ) : null}
        {summary.status === "kept" || summary.status === "dropped" ? (
          <button type="button" disabled={decide.pending} onClick={() => run("reset")} className={SMALL_WHITE}>
            Undo
          </button>
        ) : null}
        {summary.status === "pending" && detail !== null ? (
          <>
            <button type="button" disabled={decide.pending} onClick={() => run("approve")} className={SMALL_DARK}>
              Approve the carousel
            </button>
            <button type="button" disabled={decide.pending} onClick={sendBack} className={SMALL_WHITE}>
              Send it back
            </button>
          </>
        ) : null}
      </div>
      {decide.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {decide.error}
        </p>
      )}
    </div>
  );
}

/** The carousel among the week's topics when the week cannot be laid out by day: its topic, day and where it stands, with the choices. */
export function CarouselTopic({ carousel }: { readonly carousel: WeekCarousel }): ReactElement {
  const { summary } = carousel;
  const decision = decisionOf(summary);
  const headlines = slideHeadlines(carousel);
  return (
    <section aria-label="Carousel of the week" className="grid gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-[0.9375rem] font-semibold text-ink">
          Carousel{summary.topic === null ? "" : `: ${summary.topic}`}
          <span className="ml-2 text-xs font-medium text-ink-2">{summary.count} slides</span>
        </p>
        <p className="text-[0.8125rem] text-ink-2">
          {summary.date === null ? null : <span className="mr-3 font-semibold text-ink">{dayLabel(summary.date)}</span>}
          <span className={decision.tone}>{decision.word}</span>
        </p>
      </div>
      {headlines.length === 0 ? null : (
        <ol className="m-0 grid list-none gap-0.5 p-0 text-xs leading-snug text-ink-2">
          {headlines.map((slide) => (
            <li key={slide.position}>
              {slide.position}. {slide.headline}
            </li>
          ))}
        </ol>
      )}
      <Choices carousel={carousel} />
    </section>
  );
}

/**
 * The carousel among the week's pictures. Its slides show only once they are drawn: before that it says where it stands (not decided, kept
 * and waiting to be drawn, dropped), and a kept one can be drawn from here. A drawn one is approved or sent back here.
 */
export function CarouselPictures({ carousel, channel }: { readonly carousel: WeekCarousel; readonly channel: "all" | ChannelPlatform }): ReactElement {
  const { summary, detail, canChange } = carousel;
  const draw = useReviewAction();
  const drawn = carouselDrawn(summary.status) && detail !== null && detail.slides.length > 0;
  const caption = channel === "all" || detail === null ? undefined : detail.captions.find((one) => one.network === channel);
  return (
    <section aria-label="Carousel pictures" className="grid gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.9375rem] font-semibold text-ink">Carousel{summary.topic === null ? "" : `: ${summary.topic}`}</p>
        <span className={cn("text-[0.8125rem]", decisionOf(summary).tone)}>{CAROUSEL_STATUS_WORDS[summary.status]}</span>
      </div>
      {drawn ? (
        <>
          <ol className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1" aria-label="The slides of your carousel">
            {detail.slides.map((slide) => (
              <li key={slide.position} className="shrink-0">
                {/* The slide is kept by the posting service, which Next's image optimiser cannot reach. */}
                <img src={carouselSlideUrl(detail.id, slide.position)} alt={`Slide ${slide.position} of ${detail.count}`} className="size-24 rounded-lg bg-sunken object-cover" />
              </li>
            ))}
          </ol>
          {caption === undefined || channel === "all" ? null : (
            <p className="whitespace-pre-wrap break-words text-[0.84375rem] leading-relaxed text-ink">
              <span className="mb-0.5 block text-xs font-semibold text-ink-2">{PLATFORM_NAMES[channel]}</span>
              {caption.caption}
            </p>
          )}
          <Choices carousel={carousel} />
        </>
      ) : summary.status === "kept" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[0.84375rem] text-ink-2">Kept. Its slides are drawn when you press Draw pictures.</p>
          {canChange ? (
            <button type="button" disabled={draw.pending} onClick={() => draw.run(drawCarouselAction, { id: summary.id })} className={SMALL_DARK}>
              {draw.pending ? "Asking" : "Draw the carousel"}
            </button>
          ) : null}
        </div>
      ) : summary.status === "drawing" ? (
        <WorkingNote title="Drawing the carousel's slides" />
      ) : summary.status === "dropped" || summary.status === "rejected" ? (
        <p className="text-[0.84375rem] text-ink-2">{summary.status === "dropped" ? "Dropped, nothing to show." : "Sent back, nothing to show."}</p>
      ) : summary.status === "blocked" ? (
        <p className="text-[0.84375rem] text-ink-2">A slide did not pass our checks, so this carousel cannot go out.</p>
      ) : (
        <p className="text-[0.84375rem] text-ink-2">Nothing is decided yet. The slides are drawn once you keep the carousel.</p>
      )}
      {draw.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {draw.error}
        </p>
      )}
    </section>
  );
}
