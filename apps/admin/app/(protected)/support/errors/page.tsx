import { adminBrand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { listErrorIssues, type ErrorIssueStatus } from "@fynix/db";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Automatic errors" };
const STATUS_LABELS: Record<ErrorIssueStatus, string> = { new: "New", investigating: "Investigating", resolved: "Resolved", ignored: "Ignored" };

export default async function AutomaticErrorsPage({ searchParams }: { readonly searchParams: Promise<{ readonly status?: string; readonly page?: string }> }): Promise<ReactElement> {
  await requireStaffAccess();
  const search = await searchParams;
  const status = search.status !== undefined && Object.hasOwn(STATUS_LABELS, search.status) ? search.status as ErrorIssueStatus : undefined;
  const parsedPage = Number(search.page ?? 1);
  const page = Number.isSafeInteger(parsedPage) ? Math.max(1, Math.min(400, parsedPage)) : 1;
  const { issues, total } = await listErrorIssues(getStaffDb(), { status, page });
  const pages = Math.max(1, Math.ceil(total / 25));
  const pageHref = (nextPage: number): string => `/support/errors?${new URLSearchParams({ ...(status === undefined ? {} : { status }), page: String(nextPage) })}`;
  return (
    <>
      <PageHeader title="Automatic errors" back={{ href: "/support", label: "Support" }} meta={`${total.toLocaleString("en-IN")} grouped ${total === 1 ? "issue" : "issues"}`} />
      <div className="mt-8">
        <FilterPills label="Support views" options={[{ href: "/support", label: "User tickets", current: false }, { href: "/support/errors", label: "Automatic errors", current: true }]} />
      </div>
      <div className="mt-5">
        <FilterPills label="Filter automatic errors" options={[{ href: "/support/errors", label: "All", current: status === undefined }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ href: `/support/errors?status=${value}`, label, current: status === value }))]} />
      </div>
      <p className="mt-5 max-w-2xl text-sm text-ink-soft">Unexpected failures captured by {adminBrand().name}. Counts include anonymous reports; affected users estimate signed-in users only.</p>
      {issues.length === 0 ? <EmptyLine>No automatic errors in this view.</EmptyLine> : (
        <HairlineList label="Automatic error issues">
          {issues.map((issue) => (
            <HairlineRow key={issue.id} href={`/support/errors/${issue.id}`} title={`${issue.errorClass} · ${issue.route}`} sub={`${STATUS_LABELS[issue.status]} · ${issue.app} · ${issue.operation.replaceAll("_", " ")} · ${issue.occurrenceCount.toLocaleString("en-IN")} occurrences`} meta={<span className="text-sm tabular-nums text-ink-soft">~{issue.affectedUsers.count.toLocaleString("en-IN")}{issue.affectedUsers.saturated ? "+" : ""} signed-in users</span>} trail={<LocalDateTime iso={issue.lastSeenAt.toISOString()} variant="timestamp" />} />
          ))}
        </HairlineList>
      )}
      <nav aria-label="Automatic errors pages" className="mt-8 flex flex-wrap items-center gap-5 text-sm tabular-nums">
        {page > 1 ? <Link className="hover:text-accent" href={pageHref(page - 1)}>Newer</Link> : null}
        <span className="text-ink-soft">Page {page} of {pages}</span>
        {page < pages && page < 400 ? <Link className="hover:text-accent" href={pageHref(page + 1)}>Older</Link> : null}
      </nav>
    </>
  );
}
