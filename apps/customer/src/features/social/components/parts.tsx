import type { ReactNode } from "react";
import { PageHeader, Panel, PanelEmpty, PanelError, StatusBadge } from "@/components";
import { formatDate } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import { Icon, LinkButton, TabLinks } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import type { PostsView } from "../loader";
import {
  approvalCards,
  ASK_FOR_CHANGE_HREF,
  canApprove,
  dueLabel,
  monthCalendar,
  postKindLabel,
  postStatusKey,
  socialTabs,
  splitPosts,
  waitingHeadline,
  WEEKDAY_NAMES,
  type PostView,
} from "../rules";
import { ApprovalsPanel } from "./approvals-panel";

export const DEFAULT_DESCRIPTION = "Instagram and Facebook posts, and your ads.";

/** The number of posts waiting, from a posts panel that loaded; null when it did not. */
export function waitingIn(posts: Loaded<PostsView> | null): number | null {
  return posts !== null && posts.ok ? posts.data.posts.filter((post) => post.status === "awaiting_approval").length : null;
}

/** The title, the tabs, Ask for a change and (on Overview) the monthly report. */
export function SocialHeader({
  customer,
  current,
  waiting,
  description = DEFAULT_DESCRIPTION,
  reportHref = null,
}: {
  readonly customer: Pick<CustomerContext, "role">;
  readonly current: string;
  readonly waiting: number | null;
  readonly description?: string;
  readonly reportHref?: string | null;
}) {
  return (
    <PageHeader
      title="Social & Ads"
      description={description}
      tabs={<TabLinks items={socialTabs(waiting)} current={current} aria-label="Social & Ads" />}
      actions={
        <>
          {reportHref === null ? null : (
            <a href={reportHref} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
              <Icon name="ArrowUpRight" size="sm" />
              Monthly report
            </a>
          )}
          {customer.role === "viewer" ? null : <LinkButton href={ASK_FOR_CHANGE_HREF}>Ask for a change</LinkButton>}
        </>
      }
    />
  );
}

/** The approvals, first on Overview and Content. A failed read is this panel's error, never "No posts are waiting". */
export function ApprovalsSection({ customer, posts, layout, now }: { readonly customer: Pick<CustomerContext, "role" | "billing">; readonly posts: Loaded<PostsView>; readonly layout: "rows" | "cards"; readonly now: Date }) {
  if (!posts.ok) {
    return (
      <Panel title="Waiting for your approval">
        <PanelError failure={posts.error} what="your posts" />
      </Panel>
    );
  }
  const { waiting } = splitPosts(posts.data.posts, now);
  if (waiting.length === 0) {
    return (
      <Panel title="Waiting for your approval">
        <PanelEmpty icon="CheckCircle" title={waitingHeadline(waiting, now)} description="When a post is ready, it appears here as it will look, with one button to approve it." />
      </Panel>
    );
  }
  return (
    <ApprovalsPanel
      cards={approvalCards(waiting, now)}
      headline={waitingHeadline(waiting, now)}
      canApprove={canApprove(customer)}
      canAsk={customer.role !== "viewer"}
      layout={layout}
    />
  );
}

/** Every post of this week, whatever its status. */
export function ThisWeekPanel({ posts, now }: { readonly posts: readonly PostView[]; readonly now: Date }) {
  const { thisWeek } = splitPosts(posts, now);
  return (
    <Panel title="Posts this week" flush={thisWeek.length > 0}>
      {thisWeek.length === 0 ? (
        <PanelEmpty icon="CalendarBlank" title="No posts are planned for this week." description="Posts for the days ahead appear here once we have planned them." />
      ) : (
        <ul>
          {thisWeek.map((post) => (
            <li key={post.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate type-body font-medium text-ink">{post.title}</p>
                <p className="truncate type-meta">
                  {postKindLabel(post.format, post.channel)} · {dueLabel(post.dueOn, now)}
                </p>
              </div>
              <StatusBadge kind="post" status={postStatusKey(post.status)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The month as a calendar from md up, and as a dated list on phones. */
export function CalendarPanel({ posts, now, month }: { readonly posts: readonly PostView[]; readonly now: Date; readonly month: string }) {
  const weeks = monthCalendar(posts, now);
  const days = weeks.flat();
  const withPosts = days.filter((day) => day.inMonth && day.posts.length > 0);
  return (
    <Panel title="Calendar" meta={month} flush>
      {withPosts.length === 0 ? (
        <PanelEmpty icon="CalendarBlank" title={`No posts are planned for ${month} yet.`} description="Planned and published posts appear on their day." />
      ) : (
        <>
          <div role="table" aria-label={`Posts in ${month}`} className="hidden md:block">
            <div role="row" className="grid grid-cols-7 border-b border-border-subtle">
              {WEEKDAY_NAMES.map((name) => (
                <div key={name} role="columnheader" className="px-2 py-1.5 type-label">
                  {name}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]?.date} role="row" className="grid grid-cols-7">
                {week.map((day) => (
                  <div key={day.date} role="cell" className={`min-h-24 border-r border-b border-border-subtle p-2 last:border-r-0 ${day.inMonth ? "" : "bg-surface-subtle text-ink-muted"}`}>
                    <p className={`type-meta ${day.today ? "font-semibold text-ink" : ""}`}>{day.day}</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {day.inMonth
                        ? day.posts.map((post) => (
                            <li key={post.id} className="truncate rounded-control bg-neutral-wash px-1.5 py-0.5 type-meta text-ink" title={`${post.title}, ${postKindLabel(post.format, post.channel)}`}>
                              {post.title}
                              <span className="sr-only">, {postStatusKey(post.status).replace("_", " ")}</span>
                            </li>
                          ))
                        : null}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <ul className="md:hidden">
            {withPosts.flatMap((day) =>
              day.posts.map((post) => (
                <li key={post.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body font-medium text-ink">{post.title}</p>
                    <p className="truncate type-meta">
                      {postKindLabel(post.format, post.channel)} · {formatDate(new Date(`${day.date}T12:00:00+05:30`), now)}
                    </p>
                  </div>
                  <StatusBadge kind="post" status={postStatusKey(post.status)} />
                </li>
              )),
            )}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function Stack({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
