"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { REJECT_REASON_WORDS } from "@/legacy-social/lib/social/ai";
import { dayLabel, PLATFORM_NAMES } from "@/legacy-social/lib/social/auto";
import { CAROUSEL_STATUS_WORDS, carouselSlideUrl, type CarouselDetail, type CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction, makeCarouselAction } from "@/legacy-social/review-actions";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_WHITE } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

export interface CarouselCardProps {
  /** The customer's newest carousel, or undefined when there has been none. */
  readonly summary: CarouselSummary | undefined;
  /** That carousel in full (its slides and the words for each channel), or null when it could not be read. */
  readonly detail: CarouselDetail | null;
  /** The website was read and at least one account is connected, so a carousel can be asked for. */
  readonly canMake: boolean;
  /** False for a viewer, who may look but not decide. */
  readonly canChange: boolean;
  /** A carousel is being made right now. */
  readonly making: boolean;
}

/**
 * The carousel of the week: one post of 3 to 5 slides, the same slides on every connected account and the words written for each. The
 * customer decides the whole carousel at once, never one slide. Nothing goes out until it is approved.
 */
export function CarouselCard({ summary, detail, canMake, canChange, making }: CarouselCardProps): ReactElement | null {
  const make = useReviewAction();
  const decide = useReviewAction();
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  const asking = making || summary?.status === "incomplete";
  // Nothing to look at and nothing the customer can do: leave the page as it was.
  if (summary === undefined && !(canMake && canChange)) return null;

  const reasons = detail !== null && detail.reasons.length > 0 ? detail.reasons : Object.keys(REJECT_REASON_WORDS);
  const canAskAgain = canMake && canChange && summary !== undefined && (summary.status === "rejected" || summary.status === "blocked");

  return (
    <section aria-labelledby="carousel-title" className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="min-w-0">
        <h2 id="carousel-title" className={SECTION_TITLE}>
          Carousel of the week
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">
          One post of 3 to 5 slides, the same slides on every connected account, with the words written for each. It replaces one of this week&apos;s posts. Nothing goes out until you approve it.
        </p>
      </div>

      {asking ? (
        <p role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
          We are making your carousel. This page updates when it is ready.
        </p>
      ) : null}

      {summary === undefined ? null : (
        <p className="text-[0.84375rem] font-semibold text-ink">
          {CAROUSEL_STATUS_WORDS[summary.status]}
          {summary.status === "approved" && summary.date !== null ? `. It goes out on ${dayLabel(summary.date, { weekday: "long", day: "numeric", month: "long" })}.` : ""}
          {summary.status === "pending" && summary.date !== null ? `. It is for ${dayLabel(summary.date, { weekday: "long", day: "numeric", month: "long" })}.` : ""}
        </p>
      )}

      {detail === null || detail.slides.length === 0 || asking ? null : (
        <ol className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1" aria-label="The slides of your carousel">
          {detail.slides.map((slide) => (
            <li key={slide.position} className="shrink-0">
              {/* The slide is kept by the posting service, which Next's image optimiser cannot reach. */}
              <img src={carouselSlideUrl(detail.id, slide.position)} alt={`Slide ${slide.position} of ${detail.count}`} className="size-44 rounded-xl bg-sunken object-cover" />
            </li>
          ))}
        </ol>
      )}

      {detail === null || detail.captions.length === 0 || asking ? null : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {detail.captions.map((caption) => (
            <li key={caption.network} className="grid gap-1 rounded-xl bg-sunken p-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <ChannelLogo platform={caption.network} small />
                {PLATFORM_NAMES[caption.network]}
              </span>
              <span className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{caption.caption}</span>
            </li>
          ))}
        </ul>
      )}

      {summary?.status === "pending" && canChange && detail !== null ? (
        sendingBack ? (
          <div className="grid gap-2">
            <label htmlFor="carousel-reason" className="text-xs font-semibold text-ink-2">
              Why are you sending it back?
            </label>
            <select id="carousel-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink">
              <option value="">Choose a reason</option>
              {reasons.map((one) => (
                <option key={one} value={one}>
                  {REJECT_REASON_WORDS[one] ?? one}
                </option>
              ))}
            </select>
            <label htmlFor="carousel-comment" className="sr-only">
              Anything to add (optional)
            </label>
            <textarea id="carousel-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={500} placeholder="Anything to add (optional)" className="w-full rounded-lg border border-ink-2/65 bg-surface px-3 py-2 text-[0.875rem] text-ink" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={decide.pending || reason === ""}
                onClick={() => decide.run(decideCarouselAction, { id: detail.id, action: "reject", reason, ...(comment.trim() === "" ? {} : { comment }) }, () => setSendingBack(false))}
                className={SMALL_WHITE}
              >
                Send it back
              </button>
              <button type="button" onClick={() => setSendingBack(false)} className={SMALL_WHITE}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={decide.pending} onClick={() => decide.run(decideCarouselAction, { id: detail.id, action: "approve" })} className={SMALL_DARK}>
              {decide.pending ? "Saving" : "Approve the carousel"}
            </button>
            <button type="button" disabled={decide.pending} onClick={() => setSendingBack(true)} className={SMALL_WHITE}>
              Send it back
            </button>
          </div>
        )
      ) : null}

      {!asking && ((summary === undefined && canMake && canChange) || canAskAgain) ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={make.pending} onClick={() => make.run(makeCarouselAction, {})} className={SMALL_DARK}>
            {make.pending ? "Asking" : summary === undefined ? "Make this week's carousel" : "Make it again"}
          </button>
        </div>
      ) : null}

      {make.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {make.error}
        </p>
      )}
      {decide.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {decide.error}
        </p>
      )}
      {decide.notice === null ? null : (
        <p role="status" className="text-[0.84375rem] font-semibold text-sage-deep">
          {decide.notice}
        </p>
      )}
    </section>
  );
}
