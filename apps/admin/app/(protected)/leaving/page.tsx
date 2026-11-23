import { listClients, listExitFeedback, listOpenClosures, summariseExitFeedback, type ExitFeedbackRow } from "@brandbasket/db";
import { staffCan } from "@brandbasket/shared/lib/access";
import { EXIT_REASON_OPTIONS } from "@brandbasket/shared/lib/account-exit";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ClockStrip } from "@/components/compliance/clock-strip";
import { ClosuresTable } from "@/components/compliance/closures-table";
import { ReadFailed } from "@/components/compliance/read-failed";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatTiles } from "@/components/console/stat-tiles";
import { StatusDot } from "@/components/console/status-dot";
import { closureRows } from "@/lib/compliance-model";
import { readClockStrip, readGuarded } from "@/lib/server/compliance-clocks";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Closures" };

const LIST_LIMIT = 200;

const REASON_LABELS = new Map<string, string>(EXIT_REASON_OPTIONS.map((option) => [option.value, option.label]));

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** "Stayed" says only that; the offer percent is not shown (there are no discounts). */
function outcomeLine(row: ExitFeedbackRow): ReactElement {
  return row.outcome === "kept_with_offer" ? <StatusDot tone="done" label="Stayed" /> : <StatusDot tone="quiet" label="Deleted" />;
}

/**
 * Closures: the accounts being closed with Restore and Extend, then why people leave, read from what they said on Settings,
 * Delete account. The feedback names nobody: it keeps no user or business. Open to every staff member as before; the clock
 * strip and the two actions need the oversight capability, so others do not see them.
 */
export default async function LeavingPage(): Promise<ReactElement> {
  const granted = await requireStaffAccess();
  await logStaffAccess({ staffUserId: granted.user.id, action: "leaving.list", targetType: "leaving" });
  const oversight = staffCan(granted.staff.role, "oversight");
  const db = getStaffDb();
  const now = new Date();
  const [strip, closures, clients, summary, feedback] = await Promise.all([
    oversight ? readClockStrip(now) : Promise.resolve(null),
    readGuarded("closing accounts", () => listOpenClosures(db)),
    readGuarded("closing clients", () => listClients(db, { include: ["leaving"] })),
    readGuarded("closure feedback", async () => [await summariseExitFeedback(db)]),
    readGuarded("closure feedback", () => listExitFeedback(db, LIST_LIMIT)),
  ]);
  const names = new Map((clients ?? []).map((client) => [client.businessId, { name: client.businessName, ownerName: client.owner?.name ?? null }]));
  const rows = closures === null ? [] : closureRows(closures, names, now);
  const exits = summary?.[0] ?? null;

  return (
    <>
      <PageHeader title="Closures" meta="Accounts being closed, and what people said on the way out." />
      <SectionTabs page="/leaving" />
      {strip === null ? null : <ClockStrip {...strip} />}
      {closures === null ? (
        <ReadFailed title="Closures could not be loaded." message="Nothing was changed. Try again. Accounts being closed keep their erase dates while this is down." href="/leaving" />
      ) : (
        <section aria-labelledby="closing-heading" className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="closing-heading" className="text-sm font-semibold">
              Being closed
            </h2>
            <span className="text-sm text-ink-2">Data is erased 30 days after closing</span>
          </div>
          <ClosuresTable rows={rows} canAct={oversight} />
        </section>
      )}

      {exits === null || feedback === null ? (
        <ReadFailed title="What people said could not be loaded." message="Nothing was changed. Try again." href="/leaving" />
      ) : exits.total === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nobody has left yet." description="What people say when they close or nearly close an account appears here, with no name attached." />
        </div>
      ) : (
        <>
          <h2 className="mt-10 text-sm font-semibold">What people said on the way out</h2>
          <StatTiles
            items={[
              { value: exits.total, label: "Left or nearly left" },
              { value: exits.keptWithOffer, label: "Stayed" },
              { value: exits.deleted, label: "Deleted" },
            ]}
          />
          <ul aria-label="Reasons" className="mt-6 border-t border-line">
            {exits.byReason.map((entry) => (
              <li key={entry.reason} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <span>{REASON_LABELS.get(entry.reason) ?? entry.reason}</span>
                <span className="font-figure text-xl tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
          <ul aria-label="Feedback" className="mt-10 border-t border-line">
            {feedback.map((row) => (
              <li key={row.id} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="font-semibold">{REASON_LABELS.get(row.reason) ?? row.reason}</p>
                  {row.comment === null ? null : <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words text-ink-2">{row.comment}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums text-ink-2 sm:justify-end">
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
