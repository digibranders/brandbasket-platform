import { listPrivacyRequests, type StoredPrivacyRequest } from "@brandbasket/db";
import { daysUntilDue, requestUrgency, type RequestUrgency } from "@brandbasket/shared/lib/privacy-request-deadlines";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EmptyState, StatusChip } from "@brandbasket/shared/ui/patterns";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { StatTiles } from "@/components/console/stat-tiles";
import { requestClock } from "@/lib/deadline-clock";
import { PRIVACY_REQUEST_FORM_MESSAGES, REQUEST_KIND_LABELS, REQUEST_OUTCOME_LABELS } from "@/lib/privacy-request-form";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { closePrivacyRequestAction, logPrivacyRequestAction, updatePrivacyRequestAction } from "./actions";
import { buttonSmall } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";

export const metadata: Metadata = { title: "Privacy requests" };

const INPUT = fieldClasses;
const BUTTON = buttonSmall;

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

/** The timer chip: red only once it is late, gold when it is close, a quiet grey otherwise. */
function RequestTimer({ request, urgency, now }: { readonly request: StoredPrivacyRequest; readonly urgency: RequestUrgency; readonly now: Date }): ReactElement {
  if (request.status === "closed") {
    return <StatusChip label={urgencyWords(urgency, request.dueAt, now)} variant={urgency === "done_late" ? "failed" : "active"} />;
  }
  const clock = requestClock(request.dueAt, now);
  const variant = clock.late ? "failed" : urgency === "urgent" || urgency === "reminder" ? "waiting" : "idle";
  return <StatusChip label={clock.text} variant={variant} className="font-figure tabular-nums" />;
}

function RequestRow({ request, now }: { readonly request: StoredPrivacyRequest; readonly now: Date }): ReactElement {
  const urgency = requestUrgency(request, now);
  const closed = request.status === "closed";
  return (
    <li className="border-b border-line py-5 pl-1 pr-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="min-w-0 break-words font-semibold">
          {REQUEST_KIND_LABELS[request.kind]} <span className="font-normal text-ink-2">· <span className="font-figure text-xs">{request.reference}</span></span>
        </p>
        <RequestTimer request={request} urgency={urgency} now={now} />
      </div>
      <p className="mt-1 break-words text-sm text-ink-2">
        {request.subjectName === null ? "" : `${request.subjectName} · `}
        {request.subjectContact} · by {request.channel}
      </p>
      {request.details === null ? null : <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-sm">{request.details}</p>}
      <p className="mt-2 text-sm tabular-nums text-ink-2">
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
          <div className="mt-3">
            <ConfirmDialog
              title={`Close ${request.reference}`}
              consequence="The request is recorded as closed now, with the outcome and note you give. Nothing here can be deleted."
              triggerLabel="Close"
              triggerClassName={BUTTON}
              confirmLabel="Close request"
              cancelLabel="Keep open"
              formAction={closePrivacyRequestAction}
            >
              <input type="hidden" name="id" value={request.id} />
              <div className="mb-5 grid gap-4">
                <div>
                  <label htmlFor={`outcome-${request.id}`} className="block text-sm font-medium">
                    How it ended<RequiredMark />
                  </label>
                  <SelectField id={`outcome-${request.id}`} name="outcome" required options={OUTCOME_OPTIONS} placeholder="Choose" className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`resolution-${request.id}`} className="block text-sm font-medium">
                    What was done<RequiredMark />
                  </label>
                  <input id={`resolution-${request.id}`} name="resolution" required maxLength={2000} className={INPUT} />
                </div>
              </div>
            </ConfirmDialog>
          </div>
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

      <StatTiles
        label="Privacy request figures"
        items={[
          { value: open.length, label: "Open requests", note: open.length === 0 ? "All closed" : "Being worked on" },
          {
            value: needAttention.length,
            label: "Urgent or overdue",
            note: needAttention.length === 0 ? "None" : "Past day 25 or late",
            tone: needAttention.length === 0 ? "good" : "bad",
          },
          { value: requests.length - open.length, label: "Closed" },
        ]}
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
              <p className="mt-1 text-xs text-ink-2">Leave empty for now. The 30 days count from this moment.</p>
            </div>
          </div>
          <div>
            <label htmlFor="request-details" className="block text-sm font-medium">
              What they wrote
            </label>
            <textarea id="request-details" name="details" rows={3} maxLength={4000} className={INPUT} />
          </div>
          {shownProblem === null ? null : <Notice tone="problem">{shownProblem}</Notice>}
          <div>
            <GatedSubmitButton className={BUTTON} pendingLabel="Logging…">
              Log it
            </GatedSubmitButton>
          </div>
        </form>
      </section>

      {requests.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No requests yet." description="Rights requests and grievances appear here with their 30 day clock once they are logged." />
        </div>
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
