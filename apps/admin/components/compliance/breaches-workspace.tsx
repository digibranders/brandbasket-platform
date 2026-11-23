"use client";

import { DataTable, EmptyState, FilterBar, SidePanel, StatusChip, useUrlParam, type Column, type FilterOption } from "@brandbasket/shared/ui/patterns";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { useState, type ReactElement } from "react";
import { logBreachAction, updateBreachAction } from "@/app/(protected)/breaches/actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { fieldClasses } from "@/components/console/field-styles";
import type { BreachDuty, BreachRow } from "@/lib/compliance-model";
import { ClockChip } from "./clock-chip";

export interface BreachesWorkspaceProps {
  readonly rows: readonly BreachRow[];
  readonly openCount: number;
  readonly closedCount: number;
  readonly lateCount: number;
  readonly categories: readonly string[];
}

type Queue = "open" | "closed";

/** One duty as a cell: its clock while it is running, else the word for where it stands. */
function DutyCell({ duty }: { readonly duty: BreachDuty }): ReactElement {
  if (duty.clockText !== null && duty.tone !== null) return <ClockChip text={duty.clockText} tone={duty.tone} />;
  return <span className={duty.worry ? "font-medium text-error" : ""}>{duty.stateWord}</span>;
}

const DUTY_CONSEQUENCE = "The report is recorded as sent at this moment. Once recorded, the time cannot be changed.";

function Duties({ row }: { readonly row: BreachRow }): ReactElement {
  return (
    <div className="grid gap-4">
      {row.duties.map((duty) => (
        <div key={duty.key} className="min-w-0">
          <p className="text-xs font-semibold text-ink-2">{duty.title}</p>
          <p className={`mt-1 text-sm font-medium ${duty.worry ? "text-error" : ""}`}>{duty.stateWord}</p>
          {duty.clockText === null || duty.tone === null ? null : <ClockChip text={duty.clockText} tone={duty.tone} className="mt-1.5" />}
          {duty.atIso === null ? null : (
            <p className="mt-0.5 text-sm tabular-nums text-ink-2">
              {duty.done ? "" : "by "}
              <LocalDateTime iso={duty.atIso} variant="timestamp" />
            </p>
          )}
          {duty.done ? null : (
            <div className="mt-2">
              <ConfirmDialog
                title={`Record the ${duty.title.split(" (")[0]} report as sent`}
                consequence={DUTY_CONSEQUENCE}
                triggerLabel="Mark as sent now"
                triggerClassName={buttonSecondary}
                confirmLabel="Record as sent"
                cancelLabel="Keep"
                variant="default"
                formAction={updateBreachAction}
              >
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="do" value={duty.key} />
              </ConfirmDialog>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LogPanelBody({ categories }: { readonly categories: readonly string[] }): ReactElement {
  return (
    <form action={logBreachAction} className="grid gap-4">
      <div>
        <label htmlFor="breach-summary" className="block text-sm font-medium">
          What happened<RequiredMark />
        </label>
        <textarea id="breach-summary" name="summary" rows={3} required maxLength={2000} className={fieldClasses} />
        <p className="mt-1 text-xs text-ink-2">A few sentences. Do not put anyone&rsquo;s name or number here.</p>
      </div>
      <div>
        <label htmlFor="breach-detected" className="block text-sm font-medium">
          When it was found (India time)<RequiredMark />
        </label>
        <input id="breach-detected" name="detectedAt" type="datetime-local" required className={fieldClasses} />
        <p className="mt-1 text-xs text-ink-2">The 6 hour and 72 hour clocks start from this time.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Kinds of data involved</legend>
        <div className="mt-2 grid gap-2">
          {categories.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="category" value={category} className="size-4 accent-accent" />
              {category}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <GatedSubmitButton className={buttonPrimary} pendingLabel="Logging...">
          Log breach
        </GatedSubmitButton>
      </div>
    </form>
  );
}

/** Breaches: the register with a late report on top, a panel for one breach and a panel for logging one. */
export function BreachesWorkspace({ rows, openCount, closedCount, lateCount, categories }: BreachesWorkspaceProps): ReactElement {
  const [queue, setQueue] = useState<Queue>("open");
  const [openId, setOpenId] = useUrlParam("open");
  const [logging, setLogging] = useState(false);
  const shown = rows.filter((row) => (queue === "open" ? !row.closed : row.closed));
  const opened = logging ? null : (rows.find((row) => row.id === openId) ?? null);
  const index = shown.findIndex((row) => row.id === openId);

  const options: FilterOption[] = [
    { id: "open", label: "Open", count: openCount, tone: lateCount > 0 ? "late" : undefined },
    { id: "closed", label: "Closed", count: closedCount },
  ];

  const columns: readonly Column<BreachRow>[] = [
    {
      id: "breach",
      header: "Breach",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.summary}</span>
          <span className="truncate text-xs leading-4 text-ink-3">
            Found <LocalDateTime iso={row.detectedIso} variant="timestamp" />
          </span>
        </span>
      ),
    },
    { id: "cert", header: "CERT-In, 6 hours", hideBelow: "sm", cell: (row) => <DutyCell duty={row.duties[0] as BreachDuty} /> },
    { id: "board", header: "Board, 72 hours", hideBelow: "sm", cell: (row) => <DutyCell duty={row.duties[1] as BreachDuty} /> },
    { id: "status", header: "Status", align: "end", cell: (row) => <StatusChip label={row.statusWord} variant={row.closed ? "active" : "idle"} /> },
  ];

  const close = (): void => {
    setLogging(false);
    setOpenId(null);
  };

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar label="Breaches" sticky={false} options={options} value={queue} onChange={(id) => setQueue(id as Queue)} />
        </div>
        <button type="button" className={buttonPrimary} onClick={() => setLogging(true)}>
          Log a breach
        </button>
      </div>
      <DataTable
        label="Breaches"
        columns={columns}
        rows={shown}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: "Open", onRun: () => setOpenId(row.id) })}
        openId={openId}
        onOpen={(id) => setOpenId(id)}
        state={shown.length === 0 ? "empty" : "ready"}
        empty={
          queue === "open" ? (
            <EmptyState title={rows.length === 0 ? "No breaches logged." : "No open breaches."} description="A breach appears here with its 6 hour and 72 hour clocks as soon as it is logged." />
          ) : (
            <EmptyState title="Nothing closed yet." description="A breach moves here when it is closed." />
          )
        }
      />
      <SidePanel
        open={logging || opened !== null}
        onClose={close}
        title={logging ? "Log a breach" : (opened?.summary ?? "Breach")}
        subtitle={
          logging ? undefined : opened === null ? undefined : (
            <>
              {opened.statusWord}
              {opened.categories.length === 0 ? "" : `, ${opened.categories.join(", ")}`}
            </>
          )
        }
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
            <>
              {opened.status === "open" ? (
                <form action={updateBreachAction}>
                  <input type="hidden" name="id" value={opened.id} />
                  <button type="submit" name="do" value="contained" className={buttonSecondary}>
                    Mark contained
                  </button>
                </form>
              ) : null}
              <ConfirmDialog
                title="Close this breach"
                consequence="The breach is recorded as closed now. It stays in the register and nothing here can be deleted."
                triggerLabel="Close breach"
                triggerClassName={buttonPrimary}
                confirmLabel="Close breach"
                cancelLabel="Keep open"
                formAction={updateBreachAction}
              >
                <input type="hidden" name="id" value={opened.id} />
                <input type="hidden" name="do" value="closed" />
              </ConfirmDialog>
            </>
          )
        }
      >
        {logging ? <LogPanelBody categories={categories} /> : opened === null ? null : <Duties row={opened} />}
      </SidePanel>
    </div>
  );
}
