"use client";

import { DataTable, EmptyState, FilterBar, SidePanel, StatusChip, useUrlParam, type Column, type FilterOption } from "@brandbasket/shared/ui/patterns";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { useState, type ReactElement } from "react";
import { closePrivacyRequestAction, logPrivacyRequestAction, updatePrivacyRequestAction } from "@/app/(protected)/privacy-requests/actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { fieldClasses } from "@/components/console/field-styles";
import type { PrivacyCounts, PrivacyRow } from "@/lib/compliance-model";
import { ClockChip } from "./clock-chip";

export interface PrivacyWorkspaceProps {
  readonly rows: readonly PrivacyRow[];
  readonly counts: PrivacyCounts;
  readonly kindOptions: readonly SelectOption[];
  readonly outcomeOptions: readonly SelectOption[];
}

const CHANNEL_OPTIONS: readonly SelectOption[] = [
  { value: "email", label: "Email" },
  { value: "staff", label: "A call or in person" },
];

type Queue = "open" | "closed";

function RowClock({ row }: { readonly row: PrivacyRow }): ReactElement {
  if (row.tone === null) return <StatusChip label={row.clockText} variant={row.closedLate ? "failed" : "active"} />;
  return <ClockChip text={row.clockText} tone={row.tone} />;
}

/** The side panel's body for a request that came by email or a call; the same fields and action as the old inline form. */
function LogPanelBody({ kindOptions }: { readonly kindOptions: readonly SelectOption[] }): ReactElement {
  return (
    <form action={logPrivacyRequestAction} className="grid gap-4">
      <div>
        <label htmlFor="request-kind" className="block text-sm font-medium">
          What they are asking for<RequiredMark />
        </label>
        <SelectField id="request-kind" name="kind" required options={kindOptions} placeholder="Choose" className={fieldClasses} />
      </div>
      <div>
        <label htmlFor="request-name" className="block text-sm font-medium">
          Their name (if given)
        </label>
        <RuleInput id="request-name" name="name" rule="personName" autoComplete="off" maxLength={200} className={fieldClasses} />
      </div>
      <div>
        <label htmlFor="request-contact" className="block text-sm font-medium">
          Email or phone number<RequiredMark />
        </label>
        <input id="request-contact" name="contact" required minLength={3} maxLength={320} autoComplete="off" className={fieldClasses} />
      </div>
      <div>
        <label htmlFor="request-channel" className="block text-sm font-medium">
          It came by
        </label>
        <SelectField id="request-channel" name="channel" options={CHANNEL_OPTIONS} defaultValue="email" className={fieldClasses} />
      </div>
      <div>
        <label htmlFor="request-received" className="block text-sm font-medium">
          When it arrived (India time)
        </label>
        <input id="request-received" name="receivedAt" type="datetime-local" className={fieldClasses} />
        <p className="mt-1 text-xs text-ink-2">Leave empty for now. The 30 days count from this moment.</p>
      </div>
      <div>
        <label htmlFor="request-details" className="block text-sm font-medium">
          What they wrote
        </label>
        <textarea id="request-details" name="details" rows={3} maxLength={4000} className={fieldClasses} />
      </div>
      <div>
        <GatedSubmitButton className={buttonPrimary} pendingLabel="Logging...">
          Log request
        </GatedSubmitButton>
      </div>
    </form>
  );
}

function Detail({ row }: { readonly row: PrivacyRow }): ReactElement {
  return (
    <>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Clock</dt>
          <dd className="mt-1">
            <RowClock row={row} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Who</dt>
          <dd className="break-words">
            {row.who} by {row.channel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Status</dt>
          <dd>
            {row.statusWord}
            {row.identityChecked ? ", identity checked" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Received</dt>
          <dd className="tabular-nums">
            <LocalDateTime iso={row.receivedIso} variant="timestamp" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{row.closedIso === null ? "Due" : "Closed"}</dt>
          <dd className="tabular-nums">
            <LocalDateTime iso={row.closedIso ?? row.dueIso} variant="timestamp" />
          </dd>
        </div>
        {row.details === null ? null : (
          <div>
            <dt className="text-xs text-ink-3">What they wrote</dt>
            <dd className="whitespace-pre-line break-words">{row.details}</dd>
          </div>
        )}
        {row.closed ? (
          <div>
            <dt className="text-xs text-ink-3">How it ended</dt>
            <dd className="break-words">
              <span className="font-medium">{row.outcomeText}.</span> {row.resolution}
            </dd>
          </div>
        ) : null}
      </dl>
      {row.steps.length === 0 ? null : (
        <form action={updatePrivacyRequestAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={row.id} />
          {row.steps.map((step) => (
            <button key={step.doValue} type="submit" name="do" value={step.doValue} className={buttonSecondary}>
              {step.label}
            </button>
          ))}
        </form>
      )}
    </>
  );
}

/**
 * Privacy requests: the list with the most overdue first, a panel for one request and a panel for logging one, so an overdue
 * request is never pushed down the page by a form. The panel's foot holds the only dark button.
 */
export function PrivacyWorkspace({ rows, counts, kindOptions, outcomeOptions }: PrivacyWorkspaceProps): ReactElement {
  const [queue, setQueue] = useState<Queue>("open");
  const [openId, setOpenId] = useUrlParam("open");
  const [logging, setLogging] = useState(false);
  const shown = rows.filter((row) => (queue === "open" ? !row.closed : row.closed));
  const opened = logging ? null : (rows.find((row) => row.id === openId) ?? null);
  const index = shown.findIndex((row) => row.id === openId);

  const options: FilterOption[] = [
    { id: "open", label: "Open", count: counts.open, tone: counts.late > 0 ? "late" : undefined },
    { id: "closed", label: "Closed", count: counts.closed },
  ];

  const columns: readonly Column<PrivacyRow>[] = [
    {
      id: "request",
      header: "Request",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.kindLabel}</span>
          <span className="truncate text-xs leading-4 text-ink-3">
            <span className="font-figure">{row.reference}</span> {row.who}
          </span>
        </span>
      ),
    },
    { id: "status", header: "Status", hideBelow: "sm", cell: (row) => row.statusWord },
    { id: "clock", header: "Clock", align: "end", cell: (row) => <RowClock row={row} /> },
  ];

  const close = (): void => {
    setLogging(false);
    setOpenId(null);
  };

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar label="Privacy requests" sticky={false} options={options} value={queue} onChange={(id) => setQueue(id as Queue)} />
        </div>
        <button type="button" className={buttonPrimary} onClick={() => setLogging(true)}>
          Log a request
        </button>
      </div>
      <DataTable
        label="Privacy requests"
        columns={columns}
        rows={shown}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: "Open", onRun: () => setOpenId(row.id) })}
        openId={openId}
        onOpen={(id) => setOpenId(id)}
        state={shown.length === 0 ? "empty" : "ready"}
        empty={
          queue === "open" ? (
            <EmptyState title={rows.length === 0 ? "No requests yet." : "No open requests."} description="Rights requests and grievances appear here with their 30 day clock once they are logged." />
          ) : (
            <EmptyState title="Nothing closed yet." description="A request moves here when it is closed." />
          )
        }
      />
      <SidePanel
        open={logging || opened !== null}
        onClose={close}
        title={logging ? "Log a request" : (opened?.kindLabel ?? "Request")}
        subtitle={logging ? "For a request that came by email or a call." : opened === null ? undefined : <span className="font-figure">{opened.reference}</span>}
        onStep={
          logging
            ? undefined
            : (direction) => {
                const next = shown[index + direction];
                if (next !== undefined) setOpenId(next.id);
              }
        }
        secondary={
          logging || opened === null || opened.closed ? undefined : (
            <ConfirmDialog
              title={`Close ${opened.reference}`}
              consequence="The request is recorded as closed now, with the outcome and note you give. A closed request cannot be reopened, and nothing here can be deleted."
              triggerLabel="Close request"
              triggerClassName={buttonPrimary}
              confirmLabel="Close request"
              cancelLabel="Keep open"
              formAction={closePrivacyRequestAction}
            >
              <input type="hidden" name="id" value={opened.id} />
              <div className="mb-5 grid gap-4">
                <div>
                  <label htmlFor={`outcome-${opened.id}`} className="block text-sm font-medium">
                    How it ended<RequiredMark />
                  </label>
                  <SelectField id={`outcome-${opened.id}`} name="outcome" required options={outcomeOptions} placeholder="Choose" className={fieldClasses} />
                </div>
                <div>
                  <label htmlFor={`resolution-${opened.id}`} className="block text-sm font-medium">
                    What was done<RequiredMark />
                  </label>
                  <input id={`resolution-${opened.id}`} name="resolution" required maxLength={2000} className={fieldClasses} />
                </div>
              </div>
            </ConfirmDialog>
          )
        }
      >
        {logging ? <LogPanelBody kindOptions={kindOptions} /> : opened === null ? null : <Detail row={opened} />}
      </SidePanel>
    </div>
  );
}
