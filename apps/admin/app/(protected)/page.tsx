import { UserPlus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { firstName } from "@brandbasket/shared/lib/names";
import { buttonSecondary } from "@/components/console/buttons";
import { Figures } from "@/components/console/figures";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { CallsToday } from "@/components/today/calls-today";
import { NeedsSomeone } from "@/components/today/needs-someone";
import { Systems } from "@/components/today/systems";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { loadTodayPage } from "@/lib/server/today";
import { greeting, todayRange } from "@/lib/team-time";
import { todaySummary } from "@/lib/today-queue";

export const metadata: Metadata = { title: "Today" };

/** Everything that needs a person, the business at a glance, today's calls and whether every system is working. */
export default async function TodayPage(): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "today.view", targetType: "today" });
  const now = new Date();
  const endOfToday = todayRange(now).end;
  const today = await loadTodayPage(now);
  const late = today.items.filter((item) => item.dueAt !== null && item.dueAt.getTime() < now.getTime()).length;

  return (
    <div className="grid gap-[1.125rem]">
      <PageHeader
        title={`${greeting(now)}, ${firstName(user.name)}.`}
        meta={todaySummary(now, today.items.length, late, today.failed.length > 0)}
        action={
          <Link href="/leads/new" className={buttonSecondary}>
            <UserPlus size={16} aria-hidden="true" />
            Add enquiry
          </Link>
        }
      />
      <Figures items={today.figures} />
      <div className="grid items-start gap-[1.375rem] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-[1.375rem]">
          {today.failed.length > 0 ? (
            <Notice tone="problem">
              Some lists could not load: {today.failed.join(", ")}. What you see may be incomplete.
            </Notice>
          ) : null}
          {today.failed.length > 0 && today.items.length === 0 ? null : (
            <NeedsSomeone items={today.items} now={now} endOfToday={endOfToday} />
          )}
        </div>
        <div className="grid content-start gap-[1.375rem]">
          <CallsToday calls={today.calls} now={now} />
          <Systems lines={today.systems} />
        </div>
      </div>
    </div>
  );
}
