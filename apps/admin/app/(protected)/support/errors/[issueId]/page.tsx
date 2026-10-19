import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactElement } from "react";
import { z } from "zod";
import { getErrorIssue, listAssignableSupportStaff, updateErrorIssueStatus } from "@brandbasket/db";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Automatic error" };
const statusInput = z.enum(["new", "investigating", "resolved", "ignored"]);
const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
];

export default async function AutomaticErrorPage({ params, searchParams }: { readonly params: Promise<{ readonly issueId: string }>; readonly searchParams: Promise<{ readonly updated?: string }> }): Promise<ReactElement> {
  await requireStaffAccess();
  const { issueId } = await params;
  if (!z.uuid().safeParse(issueId).success) notFound();
  const issue = await getErrorIssue(getStaffDb(), issueId);
  if (issue === null) notFound();
  const staff = await listAssignableSupportStaff(getStaffDb());
  const search = await searchParams;
  const assigneeOptions: readonly SelectOption[] = [{ value: "", label: "Unassigned" }, ...staff.map((person) => ({ value: person.userId, label: person.name }))];

  async function updateStatus(formData: FormData): Promise<void> {
    "use server";
    await requireStaffAccess();
    const status = statusInput.safeParse(formData.get("status"));
    const count = z.coerce.number().int().min(1).max(2_147_483_647).safeParse(formData.get("occurrenceCount"));
    const assignee = z.string().max(200).nullable().safeParse(formData.get("assigneeStaffId") || null);
    if (!status.success || !count.success || !assignee.success) redirect(`/support/errors/${issueId}?updated=invalid`);
    const currentStaff = await listAssignableSupportStaff(getStaffDb());
    if (assignee.data !== null && !currentStaff.some((person) => person.userId === assignee.data)) redirect(`/support/errors/${issueId}?updated=invalid`);
    const changed = await updateErrorIssueStatus(getStaffDb(), issueId, status.data, count.data, assignee.data);
    revalidatePath("/support/errors");
    revalidatePath(`/support/errors/${issueId}`);
    redirect(`/support/errors/${issueId}?updated=${changed ? "saved" : "stale"}`);
  }

  return (
    <>
      <PageHeader title={issue.errorClass} back={{ href: "/support/errors", label: "Automatic errors" }} meta={`${issue.app} · ${issue.route}`} />
      {search.updated === "saved" ? <p role="status" className="mt-6 text-sm text-ink-soft">Status saved.</p> : search.updated === "stale" ? <p role="status" className="mt-6 text-sm text-accent">This issue changed while you reviewed it. Check the latest counts before updating again.</p> : search.updated === "invalid" ? <p role="alert" className="mt-6 text-sm text-accent">Choose a valid status and try again.</p> : null}
      <div className="mt-10">
        <Section title="Occurrences">
          <FactList items={[
            { label: "Count", value: issue.occurrenceCount.toLocaleString("en-IN") },
            { label: "Approximate signed-in users", value: `${issue.affectedUsers.count.toLocaleString("en-IN")}${issue.affectedUsers.saturated ? "+" : ""}` },
            { label: "First seen", value: <LocalDateTime iso={issue.firstSeenAt.toISOString()} variant="timestamp" /> },
            { label: "Last seen", value: <LocalDateTime iso={issue.lastSeenAt.toISOString()} variant="timestamp" /> },
            { label: "Regressions", value: issue.regressionCount },
            { label: "Severity", value: issue.severity === "fatal" ? "Fatal" : "Error" },
          ]} />
          <p className="mt-5 text-sm text-ink-soft">User counts are approximate and exclude anonymous visitors. No user list is recorded.</p>
        </Section>
        <Section title="Diagnostic context">
          <FactList items={[
            { label: "Operation", value: issue.operation.replaceAll("_", " ") },
            { label: "Route template", value: issue.route },
            { label: "Latest release", value: issue.release },
            { label: "Latest browser", value: issue.browser },
            { label: "Issue reference", value: <span className="break-all">{issue.id}</span> },
          ]} />
          <h3 className="mt-7 text-sm font-semibold">Safe source locations</h3>
          {issue.frames.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No allowlisted source location was available.</p> : <ol className="mt-3 space-y-2 font-mono text-sm tabular-nums">{issue.frames.map((frame, index) => <li key={`${frame.file}:${frame.line}:${frame.column}:${index}`} className="break-all">{frame.file}:{frame.line}:{frame.column}</li>)}</ol>}
          <p className="mt-4 max-w-2xl text-sm text-ink-soft">Production locations may refer to compiled JavaScript. Native capture does not upload or resolve source maps. Messages, stack text, request data and console logs are never recorded.</p>
        </Section>
        <Section title="Review status">
          <form action={updateStatus} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="occurrenceCount" value={issue.occurrenceCount} />
            <div className="min-w-48">
              <label className={labelClasses} htmlFor="error-status">Status<RequiredMark /></label>
              <SelectField id="error-status" name="status" required options={STATUS_OPTIONS} defaultValue={issue.status} className={fieldClasses} />
            </div>
            <div className="min-w-48">
              <label className={labelClasses} htmlFor="error-assignee">Assigned to</label>
              <SelectField id="error-assignee" name="assigneeStaffId" options={assigneeOptions} defaultValue={issue.assigneeStaffId ?? ""} className={fieldClasses} />
            </div>
            <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">Save status</GatedSubmitButton>
          </form>
          <p className="mt-4 text-sm text-ink-soft">A new occurrence reopens a resolved issue. Ignored issues continue counting without reopening.</p>
        </Section>
      </div>
    </>
  );
}
