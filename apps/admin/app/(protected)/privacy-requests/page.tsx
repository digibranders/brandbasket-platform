import { listPrivacyRequests, type StoredPrivacyRequest } from "@brandbasket/db";
import { daysUntilDue, requestUrgency, type RequestUrgency } from "@brandbasket/shared/lib/privacy-request-deadlines";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { PRIVACY_REQUEST_FORM_MESSAGES, REQUEST_KIND_LABELS, REQUEST_OUTCOME_LABELS } from "@/lib/privacy-request-form";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { closePrivacyRequestAction, logPrivacyRequestAction, updatePrivacyRequestAction } from "./actions";

export const metadata: Metadata = { title: "Privacy requests" };

const INPUT = "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-white px-3 py-2 text-sm text-ink focus:border-accent";
const BUTTON = "rounded-full border border-ink-soft/65 px-3.5 py-1.5 text-sm font-medium text-ink transition-colors duration-300 ease-calm hover:border-accent hover:text-accent-deep";

const KIND_OPTIONS: readonly SelectOption[] = Object.entries(REQUEST_KIND_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOME_OPTIONS: readonly SelectOption[] = Object.entries(REQUEST_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));
const CHANNEL_OPTIONS: readonly SelectOption[] = [
  { value: "email", label: "Email" },
  { value: "staff", label: "A call or in person" },
];

const STATUS_WORDS = { received: "Received", verifying: "Checking who they are", in_progress: "Being worked on", closed: "Closed" } as const;

function urgencyWords(urgency: RequestUrgency, dueAt: Date, now: Date): string {
  const days = daysUntilDue(dueAt, now);
  switch (urgency) {
    case "on_track":
      return `${days} days left`;
    case "reminder":
      return `${days} days left, past day 20`;
    case "urgent":
      return days <= 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"} left, past day 25`;
    case "overdue":
      return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
    case "done_on_time":
      return "Closed in time";
    case "done_late":
      return "Closed late";
  }
}

function RequestRow({ request, now }: { readonly request: StoredPrivacyRequest; readonly now: Date }): ReactElement {
  const urgency = requestUrgency(request, now);
  const worry = urgency === "urgent" || urgency === "overdue" || urgency === "done_late";
  const closed = request.status === "closed";
  return (
    <li className="border-b border-line py-5 pl-1 pr-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="min-w-0 break-words font-semibold">
          {REQUEST_KIND_LABELS[request.kind]} <span className="font-normal text-ink-soft">· {request.reference}</span>
        </p>
        <p className={`text-sm font-medium tabular-nums ${worry ? "text-accent-deep" : "text-ink-soft"}`}>{urgencyWords(urgency, request.dueAt, now)}</p>
      </div>
      <p className="mt-1 break-words text-sm text-ink-soft">
        {request.subjectName === null ? "" : `${request.subjectName} · `}
        {request.subjectContact} · by {request.channel}
      </p>
      {request.details === null ? null : <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-sm">{request.details}</p>}
      <p className="mt-2 text-sm tabular-nums text-ink-soft">
        {STATUS_WORDS[request.status]} · received <LocalDateTime iso={request.receivedAt.toISOString()} variant="timestamp" />
        {closed && request.closedAt !== null ? (
          <>
            {" "}
            · closed <LocalDateTime iso={request.closedAt.toISOString()} variant="timestamp" />
          </>
        ) : (
          <>
            {" "}
            · due <LocalDateTime iso={request.dueAt.toISOString()} variant="timestamp" />
          </>
        )}
        {request.identityVerifiedAt === null ? "" : " · identity checked"}
      </p>
      {closed ? (
        <p className="mt-2 max-w-2xl break-words text-sm">
          <span className="font-medium">{request.outcome === null ? "" : REQUEST_OUTCOME_LABELS[request.outcome]}.</span> {request.resolution}
        </p>
      ) : (
        <>
          <form action={updatePrivacyRequestAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="id" value={request.id} />
            {request.handledBy === null ? (
              <button type="submit" name="do" value="take" className={BUTTON}>
                Take this
              </button>
            ) : null}
            {request.status === "received" ? (
              <button type="submit" name="do" value="verifying" className={BUTTON}>
                Check who they are
              </button>
            ) : null}
            {request.identityVerifiedAt === null ? (
              <button type="submit" name="do" value="identity_checked" className={BUTTON}>
                Identity checked
              </button>
            ) : request.status !== "in_progress" ? (
              <button type="submit" name="do" value="in_progress" className={BUTTON}>
                Start the work
              </button>
            ) : null}
          </form>
          <form action={closePrivacyRequestAction} className="mt-3 grid max-w-2xl gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={request.id} />
            <div>
              <label htmlFor={`outcome-${request.id}`} className="block text-xs font-medium text-ink-soft">
                How it ended<RequiredMark />
              </label>
              <SelectField id={`outcome-${request.id}`} name="outcome" required options={OUTCOME_OPTIONS} placeholder="Choose" className={INPUT} />
            </div>
            <div>
              <label htmlFor={`resolution-${request.id}`} className="block text-xs font-medium text-ink-soft">
                What was done<RequiredMark />
              </label>
              <input id={`resolution-${request.id}`} name="resolution" required maxLength={2000} className={INPUT} />
            </div>
            <GatedSubmitButton className={BUTTON} pendingLabel="Closing…">
              Close
            </GatedSubmitButton>
          </form>
        </>
      )}
    </li>
  );
}

export default async function PrivacyRequestsPage({ searchParams }: { readonly searchParams: Promise<{ readonly problem?: string }> }): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "privacy_request.view" });
  const [requests, { problem }] = await Promise.all([listPrivacyRequests(getStaffDb()), searchParams]);
  const now = new Date();
  const shownProblem = problem !== undefined && PRIVACY_REQUEST_FORM_MESSAGES.includes(problem) ? problem : null;
  const open = requests.filter((request) => request.status !== "closed");
  const needAttention = open.filter((request) => {
    const urgency = requestUrgency(request, now);
    return urgency === "urgent" || urgency === "overdue";
  });

  return (
    <>
      <PageHeader
        title={<>Privacy <em>requests</em></>}
        meta={`Every rights request and grievance, with the day it is due. Our target is 30 days from the day it arrived; the Act allows 90 at most. ${open.length} open${needAttention.length === 0 ? "" : `, ${needAttention.length} urgent or overdue`}. Nothing here can be deleted.`}
      />

      <section className="mt-8 max-w-2xl">
        <h2 className="text-sm font-semibold">Log a request that came by email or a call</h2>
        <form action={logPrivacyRequestAction} className="mt-3 grid gap-4">
          <div>
            <label htmlFor="request-kind" className="block text-sm font-medium">
              What they are asking for<RequiredMark />
            </label>
            <SelectField id="request-kind" name="kind" required options={KIND_OPTIONS} placeholder="Choose" className={INPUT} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="request-name" className="block text-sm font-medium">
                Their name (if given)
              </label>
              <RuleInput id="request-name" name="name" rule="personName" autoComplete="off" maxLength={200} className={INPUT} />
            </div>
            <div>
              <label htmlFor="request-contact" className="block text-sm font-medium">
                Email or phone number<RequiredMark />
              </label>
              <input id="request-contact" name="contact" required minLength={3} maxLength={320} autoComplete="off" className={INPUT} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="request-channel" className="block text-sm font-medium">
                It came by
              </label>
              <SelectField id="request-channel" name="channel" options={CHANNEL_OPTIONS} defaultValue="email" className={INPUT} />
            </div>
            <div>
              <label htmlFor="request-received" className="block text-sm font-medium">
                When it arrived (India time)
              </label>
              <input id="request-received" name="receivedAt" type="datetime-local" className={INPUT} />
              <p className="mt-1 text-xs text-ink-soft">Leave empty for now. The 30 days count from this moment.</p>
            </div>
          </div>
          <div>
            <label htmlFor="request-details" className="block text-sm font-medium">
              What they wrote
            </label>
            <textarea id="request-details" name="details" rows={3} maxLength={4000} className={INPUT} />
          </div>
          {shownProblem === null ? null : (
            <p role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
              {shownProblem}
            </p>
          )}
          <div>
            <GatedSubmitButton className={BUTTON} pendingLabel="Logging…">
              Log it
            </GatedSubmitButton>
          </div>
        </form>
      </section>

      {requests.length === 0 ? (
        <EmptyLine>No requests yet.</EmptyLine>
      ) : (
        <ul aria-label="Privacy requests" className="mt-10 border-t border-line">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
