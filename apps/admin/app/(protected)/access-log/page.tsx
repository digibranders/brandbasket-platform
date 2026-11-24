import { listStaffAccessPage, listStaffRoster } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { AccessLogTable, type AccessLogRow } from "@/components/compliance/access-log-table";
import { ClockStrip } from "@/components/compliance/clock-strip";
import { ReadFailed } from "@/components/compliance/read-failed";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { ACTION_GROUPS, ACTION_LABELS, actionLabel } from "@/lib/access-log-labels";
import { accessLogHref, parseAccessLogFilters } from "@/lib/access-log-filters";
import { readClockStrip, readGuarded } from "@/lib/server/compliance-clocks";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Access log" };

/**
 * Access log (Compliance, admins only): who opened or exported personal data, filtered and paged, newest first. Records are
 * kept 13 months and nobody can edit them. The filter lists every action the console writes.
 */
export default async function AccessLogPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "access_log.view" });
  const db = getStaffDb();
  const now = new Date();
  const { filter, values, page } = parseAccessLogFilters(await searchParams);
  const [strip, result, roster] = await Promise.all([
    readClockStrip(now),
    readGuarded("access log", async () => [await listStaffAccessPage(db, filter, page)]),
    readGuarded("staff roster", () => listStaffRoster(db)),
  ]);
  const found = result?.[0] ?? null;
  const rows: AccessLogRow[] = (found?.rows ?? []).map((record) => ({
    id: record.id,
    whenIso: record.createdAt.toISOString(),
    person: record.staffEmail,
    label: record.action === "staff.sign_in" && record.result === "failed" ? "Failed sign-in" : actionLabel(record.action),
    action: record.action,
    refused: record.result === "denied",
    detail: record.detail,
    target: record.targetId ?? "",
    from: record.ipAddress ?? "",
  }));

  return (
    <>
      <PageHeader title="Access log" meta="Who opened or exported personal data in this console, newest first. Review it every week." />
      <SectionTabs page="/access-log" />
      <ClockStrip {...strip} />

      <form method="get" className="mt-6 grid gap-3 sm:grid-cols-5 sm:items-end">
        <div>
          <label htmlFor="filter-person" className={labelClasses}>
            Person
          </label>
          <select id="filter-person" name="person" defaultValue={values.person ?? ""} className={fieldClasses}>
            <option value="">Anyone</option>
            {(roster ?? []).map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-action" className={labelClasses}>
            Action
          </label>
          <select id="filter-action" name="action" defaultValue={values.action ?? ""} className={fieldClasses}>
            <option value="">Any action</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABELS[action]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-client" className={labelClasses}>
            Client id
          </label>
          <input id="filter-client" name="client" defaultValue={values.client ?? ""} spellCheck={false} autoComplete="off" className={fieldClasses} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-from" className={labelClasses}>
              From
            </label>
            <input id="filter-from" name="from" type="date" defaultValue={values.from ?? ""} className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="filter-to" className={labelClasses}>
              To
            </label>
            <input id="filter-to" name="to" type="date" defaultValue={values.to ?? ""} className={fieldClasses} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonSecondary}>
            Show
          </button>
          <Link href="/access-log" className={buttonSecondary}>
            Clear
          </Link>
        </div>
      </form>

      {found === null ? (
        <ReadFailed title="The access log could not be loaded." message="Nothing was changed. Try again. Opening and exporting customer data is still logged while this page is down." href={accessLogHref(values, page)} />
      ) : (
        <div className="mt-4">
          <AccessLogTable rows={rows} />
        </div>
      )}

      <nav aria-label="Pages" className="mt-4 flex gap-2">
        {page > 0 ? (
          <Link href={accessLogHref(values, page - 1)} className={buttonSmall}>
            Newer
          </Link>
        ) : null}
        {found?.hasMore ? (
          <Link href={accessLogHref(values, page + 1)} className={buttonSmall}>
            Older
          </Link>
        ) : null}
      </nav>
    </>
  );
}
