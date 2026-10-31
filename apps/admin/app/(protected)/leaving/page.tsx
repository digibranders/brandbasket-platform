import { listExitFeedback, summariseExitFeedback, type ExitFeedbackRow } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EXIT_REASON_OPTIONS } from "@brandbasket/shared/lib/account-exit";
import { Figures } from "@/components/console/figures";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusDot } from "@/components/console/status-dot";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Leaving" };

const LIST_LIMIT = 200;

const REASON_LABELS = new Map<string, string>(EXIT_REASON_OPTIONS.map((option) => [option.value, option.label]));

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function outcomeLine(row: ExitFeedbackRow): ReactElement {
  return row.outcome === "kept_with_offer" ? (
    <StatusDot tone="done" label={`Stayed · ${row.offerPercent}% off`} />
  ) : (
    <StatusDot tone="quiet" label="Deleted" />
  );
}

/**
 * Why people leave, read from what they said on Settings → Delete account. It names nobody: the feedback keeps no user
 * or business, so there is nothing here to act on for a person, only a picture of the reasons.
 */
export default async function LeavingPage(): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "leaving.list", targetType: "leaving" });
  const db = getStaffDb();
  const [summary, rows] = await Promise.all([summariseExitFeedback(db), listExitFeedback(db, LIST_LIMIT)]);

  return (
    <>
      <PageHeader title="Leaving" meta="What people told us on the way out." />

      <Figures
        items={[
          { value: summary.total, label: "Left or nearly left" },
          { value: summary.keptWithOffer, label: "Stayed with the offer" },
          { value: summary.deleted, label: "Deleted" },
          {
            value: summary.waitingToErase,
            label: "Waiting to be erased",
            note: "Closed, within their 30 days",
            emphasis: summary.waitingToErase > 0,
          },
        ]}
      />

      {summary.total === 0 ? (
        <EmptyLine>Nobody has left yet.</EmptyLine>
      ) : (
        <>
          <ul aria-label="Reasons" className="mt-10 border-t border-line">
            {summary.byReason.map((entry) => (
              <li key={entry.reason} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <span>{REASON_LABELS.get(entry.reason) ?? entry.reason}</span>
                <span className="font-serif text-xl tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>

          <ul aria-label="Feedback" className="mt-10 border-t border-line">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="font-semibold">{REASON_LABELS.get(row.reason) ?? row.reason}</p>
                  {row.comment === null ? null : <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words text-ink-soft">{row.comment}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums text-ink-soft sm:justify-end">
                  {outcomeLine(row)}
                  <span>{row.planCode ?? "Free listing"}</span>
                  <time dateTime={row.createdAt.toISOString()}>{dateFormat.format(row.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
