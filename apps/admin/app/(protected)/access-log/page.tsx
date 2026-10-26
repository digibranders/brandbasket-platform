import { listRecentStaffAccess, type StaffAccessAction } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Access log" };

const MAX_RECORDS = 200;

/** Typed over every action, so a new one cannot be added to the log without saying what it means here. */
const ACTION_LABELS: Readonly<Record<StaffAccessAction, string>> = {
  "staff.sign_in": "Signed in",
  "access_log.view": "Opened the access log",
  "access.denied": "Was refused: needs a higher role",
  "search.run": "Searched the console",
  "client.view": "Opened a client",
  "lead.view": "Opened a lead",
  "lead.export": "Exported enquiries",
  "outbox.view": "Opened an outbox message",
  "support_ticket.view": "Opened a support request",
  "support_attachment.view": "Opened a support screenshot",
  "directory.view": "Opened the directory",
  "invoice.view": "Downloaded an invoice",
  "invoice.export": "Exported the invoice register",
  "breach.view": "Opened the breach register",
  "breach.log": "Logged a breach",
  "breach.update": "Updated a breach",
  "privacy_request.view": "Opened the privacy requests",
  "privacy_request.log": "Logged a privacy request",
  "privacy_request.update": "Updated a privacy request",
  "privacy_request.close": "Closed a privacy request",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action as StaffAccessAction] ?? action;
}

export default async function AccessLogPage(): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "access_log.view" });
  const records = await listRecentStaffAccess(getStaffDb(), MAX_RECORDS);

  return (
    <>
      <PageHeader
        title="Access log"
        meta={`Who opened or exported personal data in this console, newest first. The last ${MAX_RECORDS} records. Review it every week; records are kept for 13 months and nobody can edit or delete them.`}
        action={
          <div className="flex gap-x-5">
            <Link href="/privacy-requests" className="link-underline text-sm font-medium">
              Privacy requests
            </Link>
            <Link href="/breaches" className="link-underline text-sm font-medium">
              Breach register
            </Link>
          </div>
        }
      />

      {records.length === 0 ? (
        <EmptyLine>Nothing recorded yet.</EmptyLine>
      ) : (
        <ul aria-label="Access records" className="mt-6 border-t border-line">
          {records.map((record) => (
            <li
              key={record.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b border-line py-4 pl-1 pr-2"
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {record.action === "staff.sign_in" && record.result === "failed" ? "Failed sign-in" : labelFor(record.action)}
                  {record.result === "denied" ? <span className="ml-2 text-sm font-normal text-accent">refused</span> : null}
                </span>
                <span className="mt-0.5 block break-words text-sm text-ink-soft">
                  <span>{record.staffEmail}</span>
                  {record.targetId === null ? null : <span className="ml-3 tabular-nums">{record.targetId}</span>}
                  {record.detail === null ? null : <span className="ml-3">{record.detail}</span>}
                  {record.ipAddress === null ? null : <span className="ml-3 tabular-nums">{record.ipAddress}</span>}
                </span>
              </span>
              <span className="text-right text-sm tabular-nums text-ink-soft">
                <LocalDateTime iso={record.createdAt.toISOString()} variant="timestamp" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
