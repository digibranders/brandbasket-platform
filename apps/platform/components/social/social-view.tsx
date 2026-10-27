import { FileText } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT, SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
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

function AdsSection({ ads, month }: { readonly ads: AdsPanel; readonly month: string }): ReactElement {
  return (
    <section aria-labelledby="ads-title" className="grid gap-3">
      <h2 id="ads-title" className={SECTION_TITLE}>
        Ads in {month}
      </h2>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2.5 text-[0.84375rem]">
        {ads.spent === null ? null : (
          <>
            <dt className="text-ink-2">Spent</dt>
            <dd className="font-figure font-semibold text-ink">{ads.spent}</dd>
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
            <dd className="font-figure font-semibold text-ink">{ads.enquiries}</dd>
          </>
        )}
        {ads.adMoney === null ? null : (
          <>
            <dt className="text-ink-2">Ad money added by us</dt>
            <dd className="font-figure font-semibold text-ink">{ads.adMoney}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** Social & Ads: the posts waiting for the customer's OK as they will look, the ad money in plain numbers, and this week's posts. */
export function SocialView({ data, notice, now }: SocialViewProps): ReactElement {
  const { waiting, thisWeek } = splitPosts(data.posts, now);
  const reportUrl = data.report !== null && data.report.startsWith("https://") ? data.report : null;
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Social &amp; Ads</h1>
          {data.monthLine === null ? null : <p className="mt-2 text-[0.84375rem] text-ink-2">{data.monthLine}</p>}
        </div>
        {reportUrl === null ? null : (
          <a href={reportUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
            <FileText size={16} aria-hidden="true" />
            Monthly report
          </a>
        )}
      </header>
      {notice === null ? null : (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", notice.ok ? "text-sage-deep" : "text-error")}>
          {notice.text}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-2">{waitingHeadline(waiting)}</p>
        ) : (
          <section aria-labelledby="waiting-title" className={cn(LIFT, "grid gap-4 p-4 sm:p-5")}>
            <h2 id="waiting-title" className={SECTION_TITLE}>
              {waitingHeadline(waiting)}
            </h2>
            {/* One post at a time on a phone (scroll snap); a grid from lg. */}
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-4">
              {waiting.map((post, index) => (
                <div key={post.id} className="min-w-full snap-center lg:min-w-0">
                  <PostCard post={post} position={index} total={waiting.length} waiting showApprove={false} />
                </div>
              ))}
            </div>
            <ApproveBar posts={waiting} />
          </section>
        )}
        <div className="grid gap-6">
          {data.ads === null ? null : <AdsSection ads={data.ads} month={data.month} />}
          <WeekList posts={thisWeek} />
        </div>
      </div>
    </div>
  );
}
