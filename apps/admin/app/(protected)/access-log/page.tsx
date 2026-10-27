import { listBreaches, listOpenPrivacyRequests, listStaffAccessPage, listStaffRoster, summariseOpenClosures, STAFF_ACCESS_ACTIONS } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDate, LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { ACTION_LABELS, actionLabel } from "@/lib/access-log-labels";
import { accessLogHref, parseAccessLogFilters } from "@/lib/access-log-filters";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Compliance" };

/**
 * Compliance (rail entry, admins only): who opened or exported personal data, filtered and paged, with the privacy
 * requests, breaches and accounts being erased summed up above it. Records are kept 13 months and nobody can edit them.
 */
export default async function CompliancePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "access_log.view" });
  const db = getStaffDb();
  const { filter, values, page } = parseAccessLogFilters(await searchParams);
  const [result, roster, privacy, breaches, closures] = await Promise.all([
    listStaffAccessPage(db, filter, page),
    listStaffRoster(db),
    listOpenPrivacyRequests(db),
    listBreaches(db),
    summariseOpenClosures(db),
  ]);
  const openBreaches = breaches.filter((breach) => breach.status !== "closed").length;

  return (
    <>
      <PageHeader title="Compliance" lead="Who opened or exported personal data in this console, newest first. Review it every week." />

      <Section title="At a glance">
        <dl className="grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-2">
            <Link href="/privacy-requests" className="link-underline">
              Privacy requests
            </Link>
          </dt>
          <dd className="text-right font-semibold">{privacy.length} open</dd>
          <dt className="text-ink-2">
            <Link href="/breaches" className="link-underline">
              Data breaches
            </Link>
          </dt>
          <dd className="text-right font-semibold">{openBreaches === 0 ? "None open" : `${openBreaches} open`}</dd>
          <dt className="text-ink-2">
            <Link href="/clients?stage=leaving" className="link-underline">
              Accounts being erased
            </Link>
          </dt>
          <dd className="text-right font-semibold">
            {closures.nextEraseAfter === null ? (
              "None"
            ) : (
              <>
                {closures.count}, next on <LocalDate iso={closures.nextEraseAfter.toISOString()} />
              </>
            )}
          </dd>
        </dl>
      </Section>

      <Section title="Access log">
        <form method="get" className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <div>
            <label htmlFor="filter-person" className={labelClasses}>
              Person
            </label>
            <select id="filter-person" name="person" defaultValue={values.person ?? ""} className={fieldClasses}>
              <option value="">Anyone</option>
              {roster.map((member) => (
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
              <option value="">Any</option>
              {STAFF_ACCESS_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
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

        {result.rows.length === 0 ? (
          <EmptyLine>Nothing matches these filters.</EmptyLine>
        ) : (
          <table className={`${TABLE} mt-4`}>
            <thead>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Person</th>
                <th className={TH}>What</th>
                <th className={TH}>Target</th>
                <th className={TH}>From</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((record) => (
                <tr key={record.id}>
                  <td className={TD_TIME}>
                    <LocalDateTime iso={record.createdAt.toISOString()} variant="timestamp" />
                  </td>
                  <td className={TD}>{record.staffEmail}</td>
                  <td className={TD}>
                    {record.action === "staff.sign_in" && record.result === "failed" ? "Failed sign-in" : actionLabel(record.action)}
                    {record.result === "denied" ? (
                      <span className="ml-2">
                        <StatusPill tone="problem">Refused</StatusPill>
                      </span>
                    ) : null}
                    {record.detail === null ? null : <span className="block text-xs text-ink-2">{record.detail}</span>}
                  </td>
                  <td className={`${TD} font-figure text-xs text-ink-2`}>{record.targetId ?? ""}</td>
                  <td className={`${TD} font-figure text-xs text-ink-2`}>{record.ipAddress ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <nav aria-label="Pages" className="mt-4 flex gap-2">
          {page > 0 ? (
            <Link href={accessLogHref(values, page - 1)} className={buttonSmall}>
              Newer
            </Link>
          ) : null}
          {result.hasMore ? (
            <Link href={accessLogHref(values, page + 1)} className={buttonSmall}>
              Older
            </Link>
          ) : null}
        </nav>
      </Section>
    </>
  );
}
