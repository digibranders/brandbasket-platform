import { FileText, Newspaper } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { DARK_BUTTON, LIFT, SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns, PageFrame, PageSection } from "@/components/v2/page";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import type { NoticeLine } from "@/lib/requests/notices";
import type { SocialData } from "@/lib/server/social";
import type { AdsPanel } from "@/lib/social/ads";
import { splitPosts, waitingHeadline } from "@/lib/social/week";
import { ApproveBar } from "./approve-bar";
import { PostCard } from "./post-card";
import { WeekList } from "./week-list";

interface SocialViewProps {
  readonly data: SocialData;
  readonly notice: NoticeLine | null;
  readonly now: Date;
}

const FIGURE = "font-figure font-semibold tabular-nums text-ink";

function AdsSection({ ads, month }: { readonly ads: AdsPanel; readonly month: string }): ReactElement {
  return (
    <PageSection id="ads" title={`Ads in ${month}`}>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-3 text-[0.84375rem]">
        {ads.spent === null ? null : (
          <>
            <dt className="text-ink-2">Spent</dt>
            <dd className={FIGURE}>{ads.spent}</dd>
            {ads.percent === null ? null : (
              <dd aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${ads.percent}%` }} />
              </dd>
            )}
          </>
        )}
        {ads.enquiries === null ? null : (
          <>
            <dt className="text-ink-2">Enquiries from ads</dt>
            <dd className={FIGURE}>{ads.enquiries}</dd>
          </>
        )}
        {ads.adMoney === null ? null : (
          <>
            <dt className="text-ink-2">Ad money added by us</dt>
            <dd className={FIGURE}>{ads.adMoney}</dd>
          </>
        )}
      </dl>
    </PageSection>
  );
}

/** Social & Ads: the posts waiting for the customer's OK as they will look, then the ad money in plain numbers and this week's posts beside them. */
export function SocialView({ data, notice, now }: SocialViewProps): ReactElement {
  const { waiting, thisWeek } = splitPosts(data.posts, now);
  const reportUrl = data.report !== null && data.report.startsWith("https://") ? data.report : null;
  return (
    <PageFrame
      title="Social & Ads"
      lede={data.monthLine ?? undefined}
      action={
        reportUrl === null ? undefined : (
          <a href={reportUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
            <FileText size={16} aria-hidden="true" />
            Monthly report
          </a>
        )
      }
    >
      {notice === null ? null : (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", notice.ok ? "text-sage-deep" : "text-error")}>
          {notice.text}
        </p>
      )}
      <PageColumns
        main={
          waiting.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={waitingHeadline(waiting)}
              text="When a post is ready, it appears here as it will look on Instagram and Facebook, with one button to approve it."
              action={
                <Link href={`${ASK_FOR_A_CHANGE_PATH}?kind=social`} className={DARK_BUTTON}>
                  Ask for a change
                </Link>
              }
            />
          ) : (
            <section aria-labelledby="waiting-title" className={cn(LIFT, "grid gap-4 p-4 sm:p-5")}>
              <h2 id="waiting-title" className={SECTION_TITLE}>
                {waitingHeadline(waiting)}
              </h2>
              {/* One post at a time on a phone (scroll snap); a grid from md, two across while the aside takes the room. */}
              <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 md:overflow-visible @4xl:grid-cols-2 @5xl:grid-cols-4">
                {waiting.map((post, index) => (
                  <div key={post.id} className="min-w-full snap-center md:min-w-0">
                    <PostCard post={post} position={index} total={waiting.length} waiting showApprove={false} />
                  </div>
                ))}
              </div>
              <ApproveBar posts={waiting} />
            </section>
          )
        }
        aside={
          <>
            {data.ads === null ? null : <AdsSection ads={data.ads} month={data.month} />}
            <WeekList posts={thisWeek} />
          </>
        }
      />
    </PageFrame>
  );
}
