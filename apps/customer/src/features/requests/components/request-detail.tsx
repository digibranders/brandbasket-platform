import type { CustomerContext } from "@/lib/guards";
import { PageHeader, Panel, PanelError, Stepper, StatusBadge, type Step } from "@/components";
import { workingDayOf } from "@brandbasket/shared/lib/working-days";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { ReactNode } from "react";
import { Banner, Badge, ServiceTag } from "@/ui";
import type { ChangeData, ThreadData } from "../loader";
import {
  ASKED_STEP,
  canWrite,
  includedEditLine,
  KIND_LABELS,
  NEW_REQUEST_PATH,
  lookedAfterLine,
  nextStep,
  requestRows,
  stepperRows,
  teamIsWaiting,
  type NoticeLine,
} from "../rules";
import type { Loaded } from "@/lib/loaded";
import { DetailsList } from "./details-list";
import { NextStepPanel } from "./next-step-panel";
import { ReadReceipt } from "./read-receipt";
import { ReplyForm } from "./reply-form";
import { Thread } from "./thread";

export interface RequestDetailProps {
  readonly customer: CustomerContext;
  readonly ticketId: string;
  readonly thread: Loaded<ThreadData>;
  readonly change: Loaded<ChangeData | null>;
  readonly notice: NoticeLine | null;
  readonly now: Date;
}

function stepsOf(rows: NonNullable<ReturnType<typeof stepperRows>>): readonly Step[] {
  return rows.map((row) => ({ label: row.label, state: row.mark, ...(row.note === null ? {} : { date: row.note }) }));
}

/** One request: where it is (stepper), what we need from the customer (NextStep), the conversation, and who looks after it. */
export function RequestDetail({ customer, ticketId, thread, change, notice, now }: RequestDetailProps) {
  const writable = canWrite(customer.role);
  const loadedThread = thread.ok ? thread.data : null;
  const ticket = loadedThread?.ticket ?? null;
  const loadedChange = change.ok ? change.data : null;
  const taxRate = customer.billing.plan?.taxRateBasisPoints ?? null;

  const kindLabel = loadedChange === null ? null : KIND_LABELS[loadedChange.change.kind];
  const description = ticket === null ? undefined : `${kindLabel ?? "Question"} · Opened ${formatDate(ticket.createdAt, now)}`;

  const steps = loadedChange === null ? null : stepperRows(loadedChange.change, loadedChange.events, now);
  const step = loadedChange === null ? null : nextStep(loadedChange.change, loadedChange.events, workingDayOf(now), now, taxRate);
  const asked = ticket !== null && teamIsWaiting(ticket.status, loadedChange?.change ?? null) && (step === null || step.action === null);
  const messages = loadedThread?.messages ?? [];
  const last = messages.at(-1);
  const closed = ticket?.status === "closed";
  const [row] = ticket === null ? [] : requestRows([{ ticketId, displayRef: ticket.displayRef, subject: ticket.subject, ticketStatus: ticket.status, category: ticket.category, createdAt: ticket.createdAt, lastActivityAt: ticket.lastActivityAt, unread: false, change: loadedChange?.change ?? null }]);

  const details: (readonly [string, ReactNode])[] = [];
  if (ticket !== null && row !== undefined) {
    details.push(
      ["Service", row.service === null ? row.kindLabel : <ServiceTag service={row.service} />],
      ["Status", row.status === "closed" ? <Badge>Closed</Badge> : <StatusBadge kind="request" status={row.status} />],
      ["Looked after by", lookedAfterLine(ticket.assigneeStaffId !== null)],
    );
    if (loadedChange !== null && loadedChange.change.page !== null) details.push(["Page", loadedChange.change.page]);
    if (loadedChange !== null) details.push(["Included edits", includedEditLine(loadedChange.change.coverage)]);
  }

  return (
    <>
      <PageHeader title={ticket?.subject ?? "Request"} description={description} back={{ href: "/requests", label: "Requests" }} />
      {notice === null ? null : (
        <Banner tone={notice.ok ? "pos" : "neg"} className="mb-4">
          {notice.text}
        </Banner>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {!change.ok ? (
            <Panel title="Progress">
              <PanelError failure={change.error} what="where your request is" />
            </Panel>
          ) : (
            <>
              {steps === null ? null : (
                <Panel>
                  <Stepper label="Progress" steps={stepsOf(steps)} />
                </Panel>
              )}
              {step !== null ? (
                <NextStepPanel step={step} requestId={loadedChange?.change.id ?? null} canAct={writable} />
              ) : asked ? (
                <NextStepPanel step={{ title: ASKED_STEP.title, text: ASKED_STEP.text, quote: null, action: null, secondary: null, note: null }} requestId={null} canAct={false} />
              ) : null}
            </>
          )}
          {!thread.ok ? (
            <Panel title="Conversation">
              <PanelError failure={thread.error} what="the conversation" />
            </Panel>
          ) : (
            <Panel title="Conversation">
              <Thread messages={messages} attachments={loadedThread?.attachments ?? []} customerName={customer.user.name} />
              {last === undefined ? null : <ReadReceipt ticketId={ticketId} messageId={last.id} />}
              {!writable ? null : closed ? (
                <p className="mt-4 type-body text-ink-2">
                  This conversation is closed. <Link href={NEW_REQUEST_PATH}>Start a new request</Link> to continue.
                </p>
              ) : (
                <div className="mt-4">
                  <ReplyForm ticketId={ticketId} sendLabel={loadedChange?.change.state === "preview" ? "Ask for a fix" : "Send reply"} />
                </div>
              )}
            </Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Details">
            {!thread.ok ? (
              <PanelError failure={thread.error} what="the details" />
            ) : (
              <DetailsList rows={details} />
            )}
          </Panel>
          <Panel title="Attachments">
            {!thread.ok ? (
              <PanelError failure={thread.error} what="the attachments" />
            ) : (loadedThread?.attachments.length ?? 0) === 0 ? (
              <p className="type-meta">No files yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 type-body">
                {loadedThread?.attachments.map((file, index) => (
                  <li key={file.id}>
                    <a href={`/support-attachments/${file.id}`} target="_blank" rel="noopener noreferrer">
                      Screenshot {index + 1}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
