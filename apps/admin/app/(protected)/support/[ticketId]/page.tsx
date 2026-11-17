import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { findFeedbackLinkForTicket, getSupportTicketForStaff, listAssignableSupportStaff, listSupportTicketErrors } from "@brandbasket/db";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { loadOpenRequest } from "@/components/requests/open-request";
import { RequestPageView } from "@/components/requests/request-page-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { OPENED_REQUEST_MESSAGES, OPENED_REQUEST_OUTCOMES } from "@/lib/support-admin-state";
import { ErrorLinkForm, RemoveErrorLink, TicketEditor } from "./ticket-forms";

export const metadata: Metadata = { title: "Request" };

/** One request as a page: the same conversation as the Requests side panel, then the ticket's own details, links and history. */
export default async function StaffTicketPage({ params, searchParams }: { readonly params: Promise<{ readonly ticketId: string }>; readonly searchParams: Promise<{ readonly opened?: string | string[] }> }): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { ticketId } = await params;
  if (!z.uuid().safeParse(ticketId).success) notFound();
  const open = await loadOpenRequest({ raw: ticketId, staffUserId: user.id });
  if (open.detail === null) {
    if (open.detailFailedFor !== null) throw new Error("The request could not be loaded.");
    notFound();
  }
  const { detail } = open;
  const db = getStaffDb();
  const [found, staff, errors, feedback] = await Promise.all([getSupportTicketForStaff(db, ticketId), listAssignableSupportStaff(db), listSupportTicketErrors(db, ticketId, user.id), findFeedbackLinkForTicket(db, ticketId)]);
  if (found === null) notFound();
  const { ticket } = found;
  const staffName = (id: string): string => (id === user.id ? "You" : (staff.find((person) => person.userId === id)?.name ?? "Staff"));
  const opened = z.enum(OPENED_REQUEST_OUTCOMES).safeParse((await searchParams).opened);
  return (
    <>
      <PageHeader title={ticket.subject} back={{ href: "/support", label: "Requests" }} meta={`${ticket.displayRef} · ${detail.categoryLabel}`} />
      {opened.success ? (
        <Notice tone={opened.data === "emailed" || opened.data === "replayed" ? "ok" : "problem"} className="mt-4">
          {OPENED_REQUEST_MESSAGES[opened.data]}
        </Notice>
      ) : null}
      {feedback === null ? null : (
        <p className="mt-4 text-sm">
          Preview feedback, round {feedback.round} ·{" "}
          <Link href={`/clients/${feedback.businessId}/website`} className="text-accent underline">
            Open the website build
          </Link>
        </p>
      )}
      <div className="mt-6">
        <RequestPageView detail={detail}>{open.changeSlot}</RequestPageView>
      </div>
      <div className="mt-10">
        <Section title="Ticket details">
          <TicketEditor key={ticket.version} ticket={ticket} />
        </Section>
        <Section title="Linked automatic errors">
          <p className="text-sm text-ink-2">
            These links and incident details are private to staff.{" "}
            <Link href="/support/errors" className="text-accent underline">
              Open Automatic errors
            </Link>{" "}
            to copy an issue reference.
          </p>
          {errors.length === 0 ? (
            <p className="mt-4 text-sm text-ink-2">No automatic errors linked.</p>
          ) : (
            <ul className="mt-5 space-y-4" aria-label="Private incident links">
              {errors.map((issue) => (
                <li key={issue.id} className="flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/support/errors/${issue.id}`} className="min-w-0 break-words text-accent hover:underline">
                    {issue.errorClass} · {issue.route}
                    <span className="mt-1 block text-sm tabular-nums text-ink-2">
                      {issue.occurrenceCount} occurrences · {issue.status}
                    </span>
                  </Link>
                  <RemoveErrorLink ticketId={ticket.id} issueId={issue.id} />
                </li>
              ))}
            </ul>
          )}
          <ErrorLinkForm ticketId={ticket.id} />
        </Section>
        <Section title="History">
          <ol className="space-y-4" aria-label="Ticket history">
            {found.events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium">{event.kind === "created" ? (event.actorUserId === ticket.requesterUserId ? "Ticket created" : "Opened for the client by staff") : event.kind === "reopened" ? "Requester reopened the ticket" : event.kind === "message_added" ? (event.data.visibility === "internal" ? "Internal note added" : "Public message added") : "Ticket details updated"}</p>
                {event.kind === "updated" ? (
                  <p className="mt-1 text-ink-2">
                    Status: {typeof event.data.status === "string" ? event.data.status.replaceAll("_", " ") : "unchanged"} · Priority: {String(event.data.priority ?? "unchanged")}
                  </p>
                ) : null}
                <p className="mt-1 tabular-nums text-ink-2">
                  {event.actorUserId === ticket.requesterUserId ? (detail.requester?.name ?? "Requester") : staffName(event.actorUserId)} · <LocalDateTime iso={event.createdAt.toISOString()} variant="timestamp" />
                </p>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
