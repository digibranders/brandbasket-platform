import type { ReactElement, ReactNode } from "react";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import type { SocialReview } from "@/legacy-social/server/social-review";
import { jobIsActive, jobLine } from "@/legacy-social/lib/social/ai";
import { dayLabel, PLATFORM_NAMES } from "@/legacy-social/lib/social/auto";
import { groupReview } from "@/legacy-social/lib/social/review-cards";
import { replaceStates } from "@/legacy-social/lib/social/review-flow";
import { AiStartCard } from "./ai-start-card";
import { AutoPostingCard } from "./auto-posting-card";
import { BrandControl } from "./brand-switcher";
import { DismissibleNotice } from "./dismissible-notice";
import { ActiveJobNote, NewChannelChoice, ReviewChannelsColumn, ReviewFlowProvider, ReviewWorkspace } from "./review-workspace";
import { ReviewRefresher } from "./review-refresher";
import { SocialTabs } from "./social-tabs";

/** Look over the posts written from the website: the facts they came from, the words for each network, and the pictures. */
export function ReviewView({ review, canChange = true, approvals = null }: { readonly review: SocialReview; /** False for a viewer, who may look at the carousel but not decide it. */ readonly canChange?: boolean; /** The posts our team has waiting for her OK, drawn above the written posts when there are any. */ readonly approvals?: ReactNode }): ReactElement {
  const active = review.jobs.find(jobIsActive);
  // Connected channels no written batch is for yet, once a plan exists (channels on different days are written one batch at a time).
  const covered = new Set(review.batches.filter((batch) => batch.posts.length > 1).flatMap((batch) => batch.networks));
  const unwritten = {
    channels: review.plan?.startsOn == null ? [] : review.channels.map((channel) => channel.platform).filter((platform) => !covered.has(platform)),
    writtenFor: review.channels.map((channel) => channel.platform).filter((platform) => covered.has(platform)),
    startDate: review.plan?.startsOn != null && review.plan.startsOn > localDateIn(BRAND_TIME_ZONE, new Date()) ? review.plan.startsOn : null,
  };
  /** The batches her own topics are written into: each is a batch of one post, shown with the topic and not among the week's topics. */
  const ownBatchIds = new Set(review.topicRequests.flatMap((request) => (request.batchId === null ? [] : [request.batchId])));
  const ownBusy = review.topicRequests.some((request) => request.state === "writing" || request.state === "drawing");
  return (
    <ReviewFlowProvider
      groups={groupReview(
        review.batches.filter((batch) => !ownBatchIds.has(batch.id)),
        [...review.waiting, ...review.approved].filter((poster) => !ownBatchIds.has(poster.batchId)),
        review.topics.filter((topic) => !ownBatchIds.has(topic.batchId)),
      )}
      drawing={review.jobs.filter((job) => job.kind === "draw" && jobIsActive(job) && job.batchId !== undefined).map((job) => job.batchId ?? "")}
      reasons={review.reasons}
      channels={review.channels}
      replacing={replaceStates(review.jobs)}
      today={localDateIn(BRAND_TIME_ZONE, new Date())}
      own={{ requests: review.topicRequests, batches: review.batches.filter((batch) => ownBatchIds.has(batch.id)), posters: [...review.waiting, ...review.approved].filter((poster) => ownBatchIds.has(poster.batchId)), canChange }}
    >
      {/* On a wide screen the channels column steps out of the shell's gutter and sits against the menu, as on the Posts and Analytics pages. */}
      <div className="flex flex-col gap-6 lg:-mt-5 lg:-ml-gutter lg:flex-row lg:gap-8">
        <ReviewChannelsColumn />
        <div className="order-first min-w-0 flex-1 lg:order-none lg:pt-5">
          <div className="mr-auto grid w-full max-w-[97.5rem] grid-cols-[minmax(0,1fr)] gap-6 md:gap-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 basis-80">
                <h1 className="type-title text-ink">Content calendar</h1>
                <p className="mt-1 type-meta">Check what we found, keep the posts you like, and approve the pictures. Nothing is drawn or posted until you say so.</p>
              </div>
              {review.brand == null ? null : (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <BrandControl view={review.brand.view} current={review.brand.externalId} name={review.brand.name} />
                </div>
              )}
            </header>
            <SocialTabs current="posts" hasNumbers={review.channels.some((channel) => channel.platform !== "linkedin")} hasPosts />
      {review.unavailable ? (
        <p role="alert" className="text-[0.8125rem] font-semibold text-error">
          We could not reach the posting service just now, so some of this may be missing. Try again in a few minutes.
        </p>
      ) : null}
      {review.expired.batches.length === 0 && review.expired.pictures.length === 0 ? null : (
        <DismissibleNotice id={`expired:${review.expired.batches.length}:${review.expired.pictures.length}`}>
          <p>Some of your posts were put away because nobody decided within 14 days.</p>
          <ul className="mt-1 grid gap-0.5 font-normal">
            {review.expired.batches.map((batch) => (
              <li key={batch.id}>A batch of your written posts was closed on {dayLabel(localDateIn(BRAND_TIME_ZONE, new Date(batch.expiredAt)), { day: "numeric", month: "long" })} before you chose.</li>
            ))}
            {review.expired.pictures.map((poster) => (
              <li key={poster.id}>
                The {PLATFORM_NAMES[poster.network]} picture for &ldquo;{poster.headline}&rdquo;{poster.canRedraw ? " can be drawn again below." : " was put away."}
              </li>
            ))}
          </ul>
        </DismissibleNotice>
      )}
      {approvals}
      {/* Starting the next channel or the next month lives with the written posts. The choice to post automatically is made when posts are started; this card appears only once it is on, to change or switch it off, or when a channel connected since needs a choice. */}
      {!canChange || active !== undefined ? null : (
        <AiStartCard jobs={review.jobs} channels={review.channels} postingDays={review.postingDays} website={review.website} expired={{ batches: review.expired.batches.length, pictures: review.expired.pictures.length }} nextMonth={review.plan?.canStartNext === true && review.plan.nextStartDate !== null ? { startDate: review.plan.nextStartDate, endsOn: review.plan.endsOn } : null} />
      )}
      {review.autoPosting !== null && review.channels.length > 0 && review.autoPosting.channels.length > 0 ? <AutoPostingCard auto={review.autoPosting} channels={review.channels} canChange={canChange} /> : null}
      <ReviewRefresher active={active !== undefined || ownBusy} />
      {active === undefined ? null : <ActiveJobNote text={`${jobLine(active).replace(/\.$/, "")}. This page updates when it is ready.`} networks={active.kind === "write" ? active.networks : undefined} />}
      {/* Nothing could be read: say so once, above, and do not also say that nothing is waiting, which would not be true. */}
      {review.unavailable && review.batches.length === 0 && review.waiting.length === 0 && review.approved.length === 0 ? null : (
        <>
          <NewChannelChoice unwritten={unwritten} missing={review.missingNetworks} postingDays={review.postingDays} website={review.website} busy={review.jobs.some((job) => jobIsActive(job))} canChange={canChange} />
          <ReviewWorkspace />
          {/* The weekly carousel card (CarouselCard) is hidden for now: it is to move to another place. */}
        </>
      )}
          </div>
        </div>
      </div>
    </ReviewFlowProvider>
  );
}
