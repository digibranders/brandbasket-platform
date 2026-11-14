import { UserPlus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { firstName } from "@brandbasket/shared/lib/names";
import { StatTile } from "@brandbasket/shared/ui/patterns";
import { buttonSecondary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { CallsToday } from "@/components/today/calls-today";
import { NeedsSomeone } from "@/components/today/needs-someone";
import { Systems } from "@/components/today/systems";
import { TodayKickoffPrompt } from "@/components/today/kickoff-prompt";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { loadTodayPage } from "@/lib/server/today";
import { greeting, todayRange } from "@/lib/team-time";
import { todaySummary } from "@/lib/today-queue";

export const metadata: Metadata = { title: "Today" };

/** Everything that needs a person, the business at a glance, today's calls and whether every system is working. */
export default async function TodayPage(): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "today.view", targetType: "today" });
  const now = new Date();
  const endOfToday = todayRange(now).end;
  const today = await loadTodayPage(now, staffCan(staff.role, "money"), staffCan(staff.role, "integrations"));
  const lateCount = today.items.filter((item) => item.dueAt !== null && item.dueAt.getTime() < now.getTime()).length;
  const dueTodayCount = today.items.filter(
    (item) => item.dueAt !== null && item.dueAt.getTime() >= now.getTime() && item.dueAt.getTime() <= endOfToday.getTime(),
  ).length;
  const onTrackCount = today.items.filter(
    (item) => item.dueAt === null || item.dueAt.getTime() > endOfToday.getTime(),
  ).length;
  const activeClientsCount = today.activeClientsCount;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${greeting(now)}, ${firstName(user.name)}.`}
        meta={todaySummary(now, today.items.length, lateCount, today.failed.length > 0)}
        action={
          <Link href="/leads/new" className={buttonSecondary}>
            <UserPlus size={16} aria-hidden="true" />
            Add enquiry
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 rounded-[14px] border border-line bg-surface p-5 shadow-card sm:grid-cols-4">
        <StatTile label="Late tasks" value={lateCount} />
        <StatTile label="Due today" value={dueTodayCount} />
        <StatTile label="On track" value={onTrackCount} />
        <StatTile label="Active clients" value={activeClientsCount} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          {today.pendingKickoffs.length > 0 ? (
            <TodayKickoffPrompt kickoffs={today.pendingKickoffs} />
          ) : null}
          {today.failed.length > 0 ? (
            <Notice tone="problem">
              Some lists could not load: {today.failed.join(", ")}. What you see may be incomplete.
            </Notice>
          ) : null}
          {today.failed.length > 0 && today.items.length === 0 ? null : (
            <NeedsSomeone items={today.items} now={now} endOfToday={endOfToday} />
          )}
        </div>
        <div className="grid content-start gap-6">
          <CallsToday calls={today.calls} now={now} />
          <Systems lines={today.systems} />
        </div>
      </div>
    </div>
  );
}
