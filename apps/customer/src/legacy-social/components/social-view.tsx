import { FileText } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { allPaused, bookedUntil, connectStatus, dayLabel, daysUntilEnd, endingSoon, endsInWords } from "@/legacy-social/lib/social/auto";
import type { LegacySocialData } from "@/legacy-social/server/load";
import Link from "next/link";
import { AiStartCard } from "./ai-start-card";
import { BrandSwitcher } from "./brand-switcher";
import { ChannelFilterProvider } from "./channel-filter";
import { ChannelsSidebar, type ChannelRow } from "./channels-sidebar";
import { ConnectStatusCard } from "./connect-status";
import { NewPostButton, NewPostRequestProvider } from "./new-post-request";
import { SMALL_SOFT } from "./small-buttons";
import { SocialCalendar } from "./social-calendar";
import { SocialTabs } from "./social-tabs";

export interface LegacySocialViewProps {
  readonly data: LegacySocialData;
  /** What the network said when it sent the customer back (`?social=connected` and the like). */
  readonly notice: { readonly ok: boolean; readonly text: string } | null;
  readonly now: Date;
  /** The posts waiting for the customer's OK, when there are any (this app's own approvals), drawn above the calendar. */
  readonly approvals?: ReactNode;
  /** Whether the Analytics tab has anything to show. */
  readonly hasNumbers: boolean;
  readonly canChange: boolean;
  /** The website given in setup, offered to start the posts from; null when there is none or this is not the first brand. */
  readonly savedWebsite: string | null;
  /** Where the latest monthly Social media report is, or null when none has been sent. */
  readonly reportHref: string | null;
}

/** The channels column's rows and its line about how far ahead posts are booked. */
function channelsColumn(data: LegacySocialData, now: Date): { rows: ChannelRow[]; bookedLine: string } {
  const rows = data.channels.map((channel): ChannelRow => ({
    id: channel.id,
    platform: channel.platform,
    account: channel.account,
    ending: endingSoon(channel, now) ? endsInWords(daysUntilEnd(channel, now) ?? 0) : null,
    paused: channel.paused === true,
  }));
  const until = bookedUntil(data.posts, data.today);
  return { rows, bookedLine: until === null ? "No posts are booked yet." : `Posts booked until ${dayLabel(until, { day: "numeric", month: "short" })}.` };
}

/**
 * Social media as it was in the old dashboard: the channels column against the rail, the title with New post, the Posts and Analytics
 * tabs, and the week calendar. Copied from the old app and left as it was.
 */
export function LegacySocialView({ data, notice, now, approvals, hasNumbers, canChange, reportHref, savedWebsite }: LegacySocialViewProps): ReactElement {
  const status = connectStatus(data.channels, data.posts, now);
  const canPost = canChange;
  const hasAccounts = data.channels.length > 0;
  // Once posts have been written from the website, looking them over is a button beside New post, not a card.
  const hasReview = data.ai.jobs.length > 0;
  const { rows, bookedLine } = channelsColumn(data, now);
  return (
    <NewPostRequestProvider>
      <ChannelFilterProvider>
        {/* On a wide screen the channels column steps out of the shell's gutter and sits against the menu, as it did in the old dashboard. */}
        <div className="flex flex-col gap-6 lg:-mt-5 lg:-ml-gutter lg:flex-row lg:gap-8">
          <ChannelsSidebar rows={rows} bookedLine={bookedLine} />
          <div className="order-first min-w-0 flex-1 lg:order-none lg:pt-5">
            <div className="mr-auto grid w-full max-w-[97.5rem] grid-cols-[minmax(0,1fr)] gap-6 md:gap-8">
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="type-title text-ink">Social media</h1>
                  <p className="mt-1 type-meta">Your posts, and what they have brought in.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {data.brand.view === null ? null : <BrandSwitcher view={data.brand.view} current={data.brand.externalId} />}
                  {reportHref === null ? null : (
                    <Link href={reportHref} className={SMALL_SOFT}>
                      <FileText size={14} aria-hidden="true" />
                      Monthly report
                    </Link>
                  )}
                  {hasReview ? (
                    <Link href="/social/review" className={SMALL_SOFT}>
                      Look over your posts
                    </Link>
                  ) : null}
                  {canPost ? <NewPostButton disabled={!hasAccounts} /> : null}
                </div>
              </header>
              <SocialTabs current="posts" hasNumbers={hasNumbers} />
              {notice === null ? null : (
                <p role={notice.ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", notice.ok ? "text-sage-deep" : "text-error")}>
                  {notice.text}
                </p>
              )}
              {data.unavailable ? (
                <p role="alert" className="text-[0.8125rem] font-semibold text-error">
                  We could not reach the posting service just now, so some of this may be missing. Try again in a few minutes.
                </p>
              ) : null}
              {data.notices.map((one) => (
                <p key={`${one.code}:${one.platform ?? ""}`} role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
                  {one.message}
                </p>
              ))}
              {status.action === null ? null : <ConnectStatusCard status={status} />}
              {allPaused(data.channels) ? (
                <p role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
                  Your posts are paused. Nothing is being sent for now. Posts whose time comes while it is paused are skipped, and new ones go out again when we resume.
                </p>
              ) : null}
              {canChange ? <AiStartCard jobs={data.ai.jobs} channels={data.channels} website={data.ai.website} savedWebsite={savedWebsite} unavailable={data.ai.jobsUnavailable} expired={data.ai.expired} nextMonth={data.ai.plan?.canStartNext === true && data.ai.plan.nextStartDate !== null ? { startDate: data.ai.plan.nextStartDate, endsOn: data.ai.plan.endsOn } : null} /> : null}
              {approvals}
              <SocialCalendar
                posts={data.posts}
                today={data.today}
                businessName={data.businessName}
                channels={data.channels}
                lede={data.posts.length === 0 ? "Your first posts appear here once your accounts are connected." : "Every post we write for you, and where it stands."}
              />
            </div>
          </div>
        </div>
      </ChannelFilterProvider>
    </NewPostRequestProvider>
  );
}
