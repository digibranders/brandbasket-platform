"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { REJECT_REASON_WORDS } from "@/legacy-social/lib/social/ai";
import { dayLabel, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { carouselSlideUrl, type CarouselDetail, type CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction } from "@/legacy-social/review-actions";
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

/** What the customer has decided about the carousel, in the words the other topics use. */
export const decisionOf = (summary: CarouselSummary): { readonly word: string; readonly tone: string } => {
  if (summary.status === "approved") return { word: "Kept", tone: "font-semibold text-ok" };
  if (summary.status === "rejected") return { word: "Dropped", tone: "text-ink-3" };
  return { word: "Not decided", tone: "font-semibold text-warn" };
};

/** The carousel among the week's topics: its topic and day, and keep or send it back. Slides are not shown here, only under Pictures once it is kept. */
export function CarouselTopic({ carousel }: { readonly carousel: WeekCarousel }): ReactElement {
  const { summary, detail, canChange } = carousel;
  const decide = useReviewAction();
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const decision = decisionOf(summary);
  const reasons = detail !== null && detail.reasons.length > 0 ? detail.reasons : Object.keys(REJECT_REASON_WORDS);
  const open = summary.status === "pending" && canChange && detail !== null;
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
      {open ? (
        sendingBack ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="carousel-week-reason" className="sr-only">
              Why are you sending it back?
            </label>
            <select id="carousel-week-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-9 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.84375rem] text-ink">
              <option value="">Choose a reason</option>
              {reasons.map((one) => (
                <option key={one} value={one}>
                  {REJECT_REASON_WORDS[one] ?? one}
                </option>
              ))}
            </select>
            <button type="button" disabled={decide.pending || reason === ""} onClick={() => decide.run(decideCarouselAction, { id: detail.id, action: "reject", reason }, () => setSendingBack(false))} className={SMALL_WHITE}>
              Send it back
            </button>
            <button type="button" onClick={() => setSendingBack(false)} className={SMALL_WHITE}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={decide.pending} onClick={() => decide.run(decideCarouselAction, { id: detail.id, action: "approve" })} className={SMALL_DARK}>
              {decide.pending ? "Saving" : "Keep"}
            </button>
            <button type="button" disabled={decide.pending} onClick={() => setSendingBack(true)} className={SMALL_WHITE}>
              Send it back
            </button>
          </div>
        )
      ) : null}
      {decide.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {decide.error}
        </p>
      )}
    </section>
  );
}

/** The carousel among the week's pictures: its slides and the words for this channel once it is kept; before that, only that nothing is decided. */
export function CarouselPictures({ carousel, channel }: { readonly carousel: WeekCarousel; readonly channel: "all" | ChannelPlatform }): ReactElement {
  const { summary, detail } = carousel;
  const kept = summary.status === "approved" && detail !== null && detail.slides.length > 0;
  const caption = channel === "all" || detail === null ? undefined : detail.captions.find((one) => one.network === channel);
  return (
    <section aria-label="Carousel pictures" className="grid gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-line">
      <p className="text-[0.9375rem] font-semibold text-ink">Carousel{summary.topic === null ? "" : `: ${summary.topic}`}</p>
      {kept ? (
        <>
          <ol className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1" aria-label="The slides of your carousel">
            {detail.slides.map((slide) => (
              <li key={slide.position} className="shrink-0">
                {/* The slide is kept by the posting service, which Next's image optimiser cannot reach. */}
                <img src={carouselSlideUrl(detail.id, slide.position)} alt={`Slide ${slide.position} of ${detail.count}`} className="size-24 rounded-lg bg-sunken object-cover" />
              </li>
            ))}
          </ol>
          {caption === undefined ? null : (
            <p className={cn("whitespace-pre-wrap break-words text-[0.84375rem] leading-relaxed text-ink")}>
              <span className="mb-0.5 block text-xs font-semibold text-ink-2">{channel === "all" ? "" : PLATFORM_NAMES[channel]}</span>
              {caption.caption}
            </p>
          )}
        </>
      ) : (
        <p className="text-[0.84375rem] text-ink-2">{summary.status === "rejected" ? "Dropped, nothing to show." : "Nothing is decided yet. The slides show here once you keep the carousel."}</p>
      )}
    </section>
  );
}
