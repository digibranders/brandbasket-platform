import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { getSupportRequesterContext, getSupportTicketForStaff, listAssignableSupportStaff, listSupportTicketErrors } from "@firstfold/db";
import { SUPPORT_STATUS_LABELS } from "@firstfold/shared/lib/support";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "@/lib/support-admin-state";
import { ErrorLinkForm, RemoveErrorLink, TicketEditor, TicketMessageForm } from "./ticket-forms";

export const metadata: Metadata = { title: "Support ticket" };
const DETAIL_LABELS: Readonly<Record<string, string>> = { pageUrl: "Page address", stepsToReproduce: "Steps to reproduce", expectedBehavior: "Expected behavior", actualBehavior: "Actual behavior", browserDevice: "Browser or device", invoiceReference: "Invoice reference", requestedChange: "Requested change", accountEmail: "Account email" };

export default async function StaffTicketPage({ params }: { readonly params: Promise<{ readonly ticketId: string }> }): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { ticketId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "support_ticket.view", targetType: "support_ticket", targetId: ticketId });
  if (!z.uuid().safeParse(ticketId).success) notFound();
  const db = getStaffDb();
  const [detail, requester, staff, errors] = await Promise.all([getSupportTicketForStaff(db, ticketId), getSupportRequesterContext(db, ticketId), listAssignableSupportStaff(db), listSupportTicketErrors(db, ticketId, user.id)]);
  if (detail === null) notFound();
  const { ticket } = detail;
  const staffName = (id: string): string => staff.find((person) => person.userId === id)?.name ?? "Staff";
  return <>
    <PageHeader title={ticket.subject} back={{ href: "/support", label: "User tickets" }} meta={`${ticket.displayRef} · ${SUPPORT_STATUS_LABELS[ticket.status]} · ${STAFF_SUPPORT_CATEGORY_LABELS[ticket.category]}`} />
    <div className="mt-10">
      <Section title="Requester"><FactList items={[{ label: "Name", value: requester?.name ?? "Account unavailable" }, { label: "Contact", value: requester?.contact ?? null }, { label: "Business", value: requester?.businessName ?? "No business selected" }, { label: "Received", value: <LocalDateTime iso={ticket.createdAt.toISOString()} variant="timestamp" /> }]} /></Section>
      <Section title="Conversation">
        <ol className="space-y-8" aria-label="Ticket conversation">{detail.messages.map((message) => <li key={message.id} className={message.visibility === "internal" ? "border-l-2 border-accent pl-5" : ""}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"><h3 className="font-semibold">{message.authorRole === "staff" ? staffName(message.authorUserId) : requester?.name ?? "Requester"}</h3><span className={message.visibility === "internal" ? "text-accent" : "text-ink-soft"}>{message.visibility === "internal" ? "Internal note · Staff only" : "Public message"}</span><span className="tabular-nums text-ink-soft"><LocalDateTime iso={message.createdAt.toISOString()} variant="timestamp" /></span></div>
          <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
          {message.details === null ? null : <dl className="mt-5 space-y-3">{Object.entries(message.details).filter(([key, value]) => Object.hasOwn(DETAIL_LABELS, key) && value !== "").map(([key, value]) => <div key={key}><dt className="text-sm text-ink-soft">{DETAIL_LABELS[key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>}
          {detail.attachments.filter((attachment) => attachment.messageId === message.id).length === 0 ? null : <ul aria-label="Screenshots" className="mt-4 space-y-2">{detail.attachments.filter((attachment) => attachment.messageId === message.id).map((attachment, index) => <li key={attachment.id}><a href={`/support-attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">Open screenshot {index + 1}: {attachment.filename}</a></li>)}</ul>}
        </li>)}</ol>
      </Section>
      <Section title={ticket.status === "closed" ? "Add staff note" : "Reply or add a note"}><TicketMessageForm ticketId={ticket.id} closed={ticket.status === "closed"} submissionKey={randomUUID()} /></Section>
      <Section title="Ticket details"><TicketEditor key={ticket.version} ticket={ticket} staff={staff} /></Section>
      <Section title="Linked automatic errors">
        <p className="text-sm text-ink-soft">These links and incident details are private to staff. <Link href="/support/errors" className="text-accent underline">Open Automatic errors</Link> to copy an issue reference.</p>
        {errors.length === 0 ? <p className="mt-4 text-sm text-ink-soft">No automatic errors linked.</p> : <ul className="mt-5 space-y-4" aria-label="Private incident links">{errors.map((issue) => <li key={issue.id} className="flex flex-wrap items-center justify-between gap-3"><Link href={`/support/errors/${issue.id}`} className="min-w-0 break-words text-accent hover:underline">{issue.errorClass} · {issue.route}<span className="mt-1 block text-sm tabular-nums text-ink-soft">{issue.occurrenceCount} occurrences · {issue.status}</span></Link><RemoveErrorLink ticketId={ticket.id} issueId={issue.id} /></li>)}</ul>}
        <ErrorLinkForm ticketId={ticket.id} />
      </Section>
      <Section title="History"><ol className="space-y-4" aria-label="Ticket history">{detail.events.map((event) => <li key={event.id} className="text-sm"><p className="font-medium">{event.kind === "created" ? "Ticket created" : event.kind === "reopened" ? "Requester reopened the ticket" : event.kind === "message_added" ? event.data.visibility === "internal" ? "Internal note added" : "Public message added" : "Ticket details updated"}</p>{event.kind === "updated" ? <p className="mt-1 text-ink-soft">Status: {typeof event.data.status === "string" ? event.data.status.replaceAll("_", " ") : "unchanged"} · Priority: {String(event.data.priority ?? "unchanged")}</p> : null}<p className="mt-1 tabular-nums text-ink-soft">{event.actorUserId === ticket.requesterUserId ? requester?.name ?? "Requester" : staffName(event.actorUserId)} · <LocalDateTime iso={event.createdAt.toISOString()} variant="timestamp" /></p></li>)}</ol></Section>
    </div>
  </>;
}
