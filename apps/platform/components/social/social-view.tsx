import { FileText, Newspaper } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { DARK_BUTTON, LIFT, SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
import { ServiceSetupCard } from "@/components/setup/service-setup-card";
import { EmptyState, PageColumns, PageFrame } from "@/components/v2/page";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import { bookedUntil, connectStatus, dayLabel, daysUntilEnd, endingSoon, endsInWords } from "@/lib/social/auto";
import type { NoticeLine } from "@/lib/requests/notices";
import type { SocialConnect, SocialData } from "@/lib/server/social";
import type { SetupAsk } from "@/lib/setup-asks";
import { splitPosts, waitingHeadline } from "@/lib/social/week";
import { ApproveBar } from "./approve-bar";
import { ChannelFilterProvider } from "./channel-filter";
import { ChannelsSidebar, type ChannelRow } from "./channels-sidebar";
import { ConnectStatusCard } from "./connect-status";
import { NewPostButton, NewPostRequestProvider } from "./new-post-request";
import { PostCard } from "./post-card";
import { SocialCalendar } from "./social-calendar";
import { WeekList } from "./week-list";

interface SocialViewProps {
  readonly data: SocialData;
  readonly notice: NoticeLine | null;
  readonly now: Date;
  /** What we still need from the customer to start: shown as one card at the top. */
  readonly setup?: readonly SetupAsk[];
}

/** The channels column's rows and its line about how far ahead posts are booked. */
function channelsColumn(connect: SocialConnect, now: Date): { rows: ChannelRow[]; bookedLine: string } {
  const rows = connect.channels.map((channel): ChannelRow => ({
    id: channel.id,
    platform: channel.platform,
    account: channel.account,
    ending: endingSoon(channel, now) ? endsInWords(daysUntilEnd(channel, now) ?? 0) : null,
  }));
  const until = bookedUntil(connect.posts, connect.today);
  return { rows, bookedLine: until === null ? "No posts are booked yet." : `Posts booked until ${dayLabel(until, { day: "numeric", month: "short" })}.` };
}

/** Social media: the posts waiting for the customer's OK as they will look, then the ad money in plain numbers and this week's posts beside them. */
export function SocialView({ data, notice, now, setup = [] }: SocialViewProps): ReactElement {
  const { waiting, thisWeek } = splitPosts(data.posts, now);
  const reportUrl = data.report !== null && data.report.startsWith("https://") ? data.report : null;
  const connect = data.connect;
  const status = connect === null ? null : connectStatus(connect.channels, connect.posts, now);
  // New post needs an account to post to.
  const canPost = connect !== null && connect.channels.length > 0;
  const frame = (
    <PageFrame
      title="Social media"
      lede={data.monthLine ?? "Your posts, and what they have brought in."}
      action={
        reportUrl === null && !canPost ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            {reportUrl === null ? null : (
              <a href={reportUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
                <FileText size={16} aria-hidden="true" />
                Monthly report
              </a>
            )}
            {canPost ? <NewPostButton /> : null}
          </div>
        )
      }
    >
      {notice === null ? null : (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", notice.ok ? "text-sage-deep" : "text-error")}>
          {notice.text}
        </p>
      )}
      {connect === null ? <ServiceSetupCard asks={setup} /> : null}
      {connect === null || status === null ? null : (
        <>
          {connect.unavailable ? (
            <p role="alert" className="text-[0.8125rem] font-semibold text-error">
              We could not reach the posting service just now, so some of this may be missing. Try again in a few minutes.
            </p>
          ) : null}
          {status.action === null ? null : <ConnectStatusCard status={status} />}
          <SocialCalendar
            posts={connect.posts}
            today={connect.today}
            businessName={connect.businessName}
            channels={connect.channels}
            lede={connect.posts.length === 0 ? "Your first posts appear here once your accounts are connected." : "Every post we write for you, and where it stands."}
          />
          {/* The questions about the ad budget (and the older "link your pages" one) come after the posts: the accounts are connected with the buttons now. */}
          <ServiceSetupCard asks={setup} />
        </>
      )}
      {/* With the calendar above showing the week, a page with no post waiting for the customer's OK has nothing more to add. */}
      {connect !== null && waiting.length === 0 ? null : (
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
            {null}
            {connect === null ? <WeekList posts={thisWeek} /> : null}
          </>
        }
      />
      )}
    </PageFrame>
  );
  if (connect === null || status === null) return frame;
  const { rows, bookedLine } = channelsColumn(connect, now);
  return (
    <NewPostRequestProvider>
    <ChannelFilterProvider>
      {/* The channels column sits flush against the rail, so it steps out of the shell's padding and the page puts the same padding back. On a phone the posts come first and the channels follow. */}
      <div className="-mx-4 -mb-28 -mt-6 flex flex-col md:-mx-8 lg:-mb-16 lg:-mt-10 lg:flex-row xl:-mx-10">
        <ChannelsSidebar rows={rows} bookedLine={bookedLine} />
        <div className="order-first min-w-0 flex-1 px-4 pb-8 pt-6 md:px-8 lg:order-none lg:pb-16 lg:pt-10 xl:px-10">{frame}</div>
      </div>
    </ChannelFilterProvider>
    </NewPostRequestProvider>
  );
}
