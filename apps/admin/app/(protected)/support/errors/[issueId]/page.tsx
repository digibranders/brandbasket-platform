import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { getErrorIssue } from "@brandbasket/db";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { ErrorStatusControl } from "@/components/console/error-status-control";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { ERROR_STATUS_LABELS, ERROR_STATUS_TONES } from "@/lib/error-status";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Error" };
export default async function AutomaticErrorPage({ params }: { readonly params: Promise<{ readonly issueId: string }> }): Promise<ReactElement> {
  await requireStaffAccess();
  const { issueId } = await params;
  if (!z.uuid().safeParse(issueId).success) notFound();
  const issue = await getErrorIssue(getStaffDb(), issueId);
  if (issue === null) notFound();
  return (
    <>
      <PageHeader title={issue.errorClass} back={{ href: "/support/errors", label: "App errors" }} meta={`${issue.app} · ${issue.route}`} />
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
          <p className="mt-5 text-sm text-ink-2">User counts are approximate and exclude anonymous visitors. No user list is recorded.</p>
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
          {issue.frames.length === 0 ? <p className="mt-2 text-sm text-ink-2">No allowlisted source location was available.</p> : <ol className="mt-3 space-y-2 font-mono text-sm tabular-nums">{issue.frames.map((frame, index) => <li key={`${frame.file}:${frame.line}:${frame.column}:${index}`} className="break-all">{frame.file}:{frame.line}:{frame.column}</li>)}</ol>}
          <p className="mt-4 max-w-2xl text-sm text-ink-2">Production locations may refer to compiled JavaScript. Native capture does not upload or resolve source maps. Messages, stack text, request data and console logs are never recorded.</p>
        </Section>
        <Section title="Review status" aside={<StatusPill tone={ERROR_STATUS_TONES[issue.status]}>{ERROR_STATUS_LABELS[issue.status]}</StatusPill>}>
          <ErrorStatusControl issueId={issue.id} errorClass={issue.errorClass} status={issue.status} occurrenceCount={issue.occurrenceCount} />
          <p className="mt-4 text-sm text-ink-2">A new occurrence reopens a resolved issue. Ignored issues continue counting without reopening.</p>
        </Section>
      </div>
    </>
  );
}
