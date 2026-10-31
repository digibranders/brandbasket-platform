import { adminBrand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { listErrorIssues, type ErrorIssueStatus } from "@brandbasket/db";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { LIFT } from "@/components/console/classes";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Errors" };
const STATUS_LABELS: Record<ErrorIssueStatus, string> = { new: "New", investigating: "Investigating", resolved: "Resolved", ignored: "Ignored" };
const STATUS_TONES: Record<ErrorIssueStatus, PillTone> = { new: "problem", investigating: "progress", resolved: "done", ignored: "todo" };

export default async function AutomaticErrorsPage({ searchParams }: { readonly searchParams: Promise<{ readonly status?: string; readonly page?: string }> }): Promise<ReactElement> {
  await requireStaffAccess();
  const search = await searchParams;
  const status = search.status !== undefined && Object.hasOwn(STATUS_LABELS, search.status) ? (search.status as ErrorIssueStatus) : undefined;
  const parsedPage = Number(search.page ?? 1);
  const page = Number.isSafeInteger(parsedPage) ? Math.max(1, Math.min(400, parsedPage)) : 1;
  const { issues, total } = await listErrorIssues(getStaffDb(), { status, page });
  const pages = Math.max(1, Math.ceil(total / 25));
  const pageHref = (nextPage: number): string => `/support/errors?${new URLSearchParams({ ...(status === undefined ? {} : { status }), page: String(nextPage) })}`;
  return (
    <>
      <PageHeader title="Errors" meta={`${total.toLocaleString("en-IN")} grouped ${total === 1 ? "issue" : "issues"}. Unexpected failures captured by ${adminBrand().name}.`} />
      <div className="mt-6">
        <FilterPills
          label="Filter errors"
          options={[
            { href: "/support/errors", label: "All", current: status === undefined },
            ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ href: `/support/errors?status=${value}`, label, current: status === value })),
          ]}
        />
      </div>
      {issues.length === 0 ? (
        <div className="mt-6">
          <EmptyLine>No errors in this view.</EmptyLine>
        </div>
      ) : (
        <section aria-label="Error issues" className={`${LIFT} mt-6 overflow-x-auto px-4`}>
          <TableScroll label="Errors">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Error</th>
                  <th className={TH}>Where</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Occurrences</th>
                  <th className={`${TH} text-right`}>Signed-in users</th>
                  <th className={TH}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td className={TD}>
                      <Link href={`/support/errors/${issue.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {issue.errorClass}
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-2">{issue.operation.replaceAll("_", " ")}</span>
                    </td>
                    <td className={TD}>
                      <span className="break-all">{issue.route}</span>
                      <span className="mt-0.5 block text-xs text-ink-2">{issue.app}</span>
                    </td>
                    <td className={TD}>
                      <StatusPill tone={STATUS_TONES[issue.status]}>{STATUS_LABELS[issue.status]}</StatusPill>
                    </td>
                    <td className={TD_NUM}>{issue.occurrenceCount.toLocaleString("en-IN")}</td>
                    <td className={TD_NUM}>
                      ~{issue.affectedUsers.count.toLocaleString("en-IN")}
                      {issue.affectedUsers.saturated ? "+" : ""}
                    </td>
                    <td className={TD_TIME}>
                      <LocalDateTime iso={issue.lastSeenAt.toISOString()} variant="timestamp" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
      <p className="mt-4 text-sm text-ink-2">Counts include anonymous reports; signed-in users is an estimate.</p>
      <nav aria-label="Error pages" className="mt-6 flex flex-wrap items-center gap-5 text-sm tabular-nums">
        {page > 1 ? (
          <Link className="font-semibold hover:underline" href={pageHref(page - 1)}>
            Newer
          </Link>
        ) : null}
        <span className="text-ink-2">
          Page {page} of {pages}
        </span>
        {page < pages && page < 400 ? (
          <Link className="font-semibold hover:underline" href={pageHref(page + 1)}>
            Older
          </Link>
        ) : null}
      </nav>
    </>
  );
}
