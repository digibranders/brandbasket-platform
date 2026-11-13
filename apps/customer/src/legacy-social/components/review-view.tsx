import Link from "next/link";
import type { ReactElement } from "react";
import { PageFrame } from "./page-frame";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import type { SocialReview } from "@/legacy-social/server/social-review";
import { jobIsActive, jobLine } from "@/legacy-social/lib/social/ai";
import { dayLabel, PLATFORM_NAMES } from "@/legacy-social/lib/social/auto";
import { groupReview } from "@/legacy-social/lib/social/review-cards";
import { BrandSwitcher } from "./brand-switcher";
import { CarouselCard } from "./carousel-card";
import { DismissibleNotice } from "./dismissible-notice";
import { NetworksPanel } from "./networks-panel";
import { SMALL_SOFT } from "./small-buttons";
import { PostsPanel } from "./posts-panel";
import { ReviewRefresher } from "./review-refresher";

/** Look over the posts written from the website: the facts they came from, the words for each network, and the pictures. */
export function ReviewView({ review, canChange = true }: { readonly review: SocialReview; /** False for a viewer, who may look at the carousel but not decide it. */ readonly canChange?: boolean }): ReactElement {
  const active = review.jobs.find(jobIsActive);
  return (
    <PageFrame
      title="Look over your posts"
      lede="Check what we found, keep the posts you like, and approve the pictures. Nothing is drawn or posted until you say so."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {review.brand?.view == null ? null : <BrandSwitcher view={review.brand.view} current={review.brand.externalId} />}
          <Link href="/social" className={SMALL_SOFT}>
            Back to Social media
          </Link>
        </div>
      }
    >
      {review.unavailable ? (
        <p role="alert" className="text-[0.8125rem] font-semibold text-error">
          We could not reach the posting service just now, so some of this may be missing. Try again in a few minutes.
        </p>
      ) : null}
      {review.limits === null || review.limits.channels.length === 0 ? null : (
        <p className="text-[0.8125rem] text-ink-2">
          Pictures left this week:{" "}
          {review.limits.channels.map((channel, index) => (
            <span key={channel.network}>
              {index === 0 ? "" : ", "}
              {PLATFORM_NAMES[channel.network]} {channel.left} of {channel.limit}
            </span>
          ))}
          . Each network gets its own picture, and the count starts again on {dayLabel(review.limits.restart, { day: "numeric", month: "long" })}.
        </p>
      )}
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
      <ReviewRefresher active={active !== undefined} />
      {active === undefined ? null : (
        <p role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
          {jobLine(active).replace(/\.$/, "")}. This page updates when it is ready.
        </p>
      )}
      {/* Nothing could be read: say so once, above, and do not also say that nothing is waiting, which would not be true. */}
      {review.unavailable && review.batches.length === 0 && review.waiting.length === 0 && review.approved.length === 0 ? null : (
        <>
          <CarouselCard summary={review.carousels[0]} detail={review.carousel} canMake={review.canMakeCarousel} canChange={canChange} making={review.jobs.some((job) => job.kind === "carousel" && jobIsActive(job))} weekly={review.weeklyCarousel} />
          <NetworksPanel missing={review.missingNetworks} busy={review.jobs.some((job) => job.kind === "network" && jobIsActive(job))} />
          <PostsPanel groups={groupReview(review.batches, [...review.waiting, ...review.approved], review.topics)} drawing={review.jobs.filter((job) => job.kind === "draw" && jobIsActive(job) && job.batchId !== undefined).map((job) => job.batchId ?? "")} reasons={review.reasons} />
        </>
      )}
    </PageFrame>
  );
}
