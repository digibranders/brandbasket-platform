import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { z } from "zod";
import { countActiveErrorIssues, listAssignableSupportStaff, listSupportTicketsForStaff } from "@firstfold/db";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, SUPPORT_STATUS_LABELS } from "@firstfold/shared/lib/support";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "@/lib/support-admin-state";

export const metadata: Metadata = { title: "Support" };
const capitalised = (value: string): string => `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
const filtersSchema = z.object({ status: z.enum(SUPPORT_STATUSES).optional(), category: z.enum(SUPPORT_CATEGORIES).optional(), priority: z.enum(SUPPORT_PRIORITIES).optional(), assignee: z.string().trim().max(200).optional(), search: z.string().trim().max(120).optional(), cursor: z.uuid().optional() });

export default async function SupportInbox({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactElement> {
  await requireStaffAccess();
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value === "" ? undefined : value])));
  const filters = parsed.success ? parsed.data : {};
  const db = getStaffDb();
  const [page, staff, errors] = await Promise.all([
    listSupportTicketsForStaff(db, { ...filters, assigneeStaffId: filters.assignee === "unassigned" ? null : filters.assignee || undefined, limit: 25 }),
    listAssignableSupportStaff(db), countActiveErrorIssues(db),
  ]);
  const statusOptions: readonly SelectOption[] = [{ value: "", label: "All statuses" }, ...SUPPORT_STATUSES.map((value) => ({ value, label: SUPPORT_STATUS_LABELS[value] }))];
  const categoryOptions: readonly SelectOption[] = [{ value: "", label: "All categories" }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }))];
  const priorityOptions: readonly SelectOption[] = [{ value: "", label: "All priorities" }, ...SUPPORT_PRIORITIES.map((value) => ({ value, label: capitalised(value) }))];
  const assigneeOptions: readonly SelectOption[] = [{ value: "", label: "Anyone" }, { value: "unassigned", label: "Unassigned" }, ...staff.map((person) => ({ value: person.userId, label: person.name }))];
  const nextParams = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (page.nextCursor !== null) nextParams.set("cursor", page.nextCursor);
  return (
    <>
      <PageHeader title="Support" meta="Read feedback, reply to requesters and follow up with the team." />
      <div className="mt-8"><FilterPills label="Support views" options={[{ href: "/support", label: "User tickets", current: true }, { href: "/support/errors", label: "Automatic errors", count: errors, current: false }]} /></div>
      <form method="get" action="/support" className="mt-8 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><label htmlFor="support-search" className={labelClasses}>Search subject or reference</label><input id="support-search" name="search" type="search" maxLength={120} defaultValue={filters.search} className={fieldClasses} /></div>
        <div><label htmlFor="support-status" className={labelClasses}>Status</label><SelectField id="support-status" name="status" options={statusOptions} defaultValue={filters.status ?? ""} className={fieldClasses} /></div>
        <div><label htmlFor="support-category" className={labelClasses}>Category</label><SelectField id="support-category" name="category" options={categoryOptions} defaultValue={filters.category ?? ""} className={fieldClasses} /></div>
        <div><label htmlFor="support-priority" className={labelClasses}>Priority</label><SelectField id="support-priority" name="priority" options={priorityOptions} defaultValue={filters.priority ?? ""} className={fieldClasses} /></div>
        <div><label htmlFor="support-assignee" className={labelClasses}>Assigned to</label><SelectField id="support-assignee" name="assignee" options={assigneeOptions} defaultValue={filters.assignee ?? ""} className={fieldClasses} /></div>
        <div className="flex flex-wrap items-center gap-4 pb-1"><GatedSubmitButton className={buttonSecondary}>Apply filters</GatedSubmitButton><Link href="/support" className="text-sm text-ink-soft hover:text-accent">Clear</Link></div>
      </form>
      {!parsed.success ? <p role="status" className="mt-4 text-sm text-accent">Some filters weren’t valid. Showing all tickets.</p> : null}
      {page.items.length === 0 ? <EmptyLine>No tickets match these filters.</EmptyLine> : <HairlineList label="User support tickets">{page.items.map((ticket) => <HairlineRow key={ticket.id} href={`/support/${ticket.id}`} title={ticket.subject} sub={`${ticket.displayRef} · ${SUPPORT_STATUS_LABELS[ticket.status]} · ${STAFF_SUPPORT_CATEGORY_LABELS[ticket.category]}`} meta={<span className="text-sm text-ink-soft">{ticket.priority[0]?.toUpperCase()}{ticket.priority.slice(1)} · {staff.find((person) => person.userId === ticket.assigneeStaffId)?.name ?? "Unassigned"}</span>} trail={<LocalDateTime iso={ticket.lastActivityAt.toISOString()} variant="timestamp" />} />)}</HairlineList>}
      {page.nextCursor === null ? null : <Link href={`/support?${nextParams}`} className={`${buttonSecondary} mt-8`}>Older tickets</Link>}
    </>
  );
}
