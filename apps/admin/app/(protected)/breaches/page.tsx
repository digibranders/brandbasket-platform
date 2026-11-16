import { listBreaches, type StoredBreach } from "@brandbasket/db";
import { breachDeadlines, breachDutyState, type BreachDutyState } from "@brandbasket/shared/lib/breach-deadlines";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EmptyState, StatusChip } from "@brandbasket/shared/ui/patterns";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { StatTiles } from "@/components/console/stat-tiles";
import { breachClock } from "@/lib/deadline-clock";
import { BREACH_DATA_CATEGORIES, BREACH_FORM_MESSAGES } from "@/lib/breach-form";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { logBreachAction, updateBreachAction } from "./actions";
import { buttonSmall } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";

export const metadata: Metadata = { title: "Breaches" };

const INPUT = fieldClasses;
const BUTTON = buttonSmall;

const STATE_WORDS: Readonly<Record<BreachDutyState, string>> = {
  done: "Done",
  done_on_time: "Done in time",
  done_late: "Done late",
  due: "Due",
  overdue: "Overdue",
  due_without_delay: "Owed without delay",
};

function Duty({ title, doneAt, deadline, now, doItNow, id }: { readonly title: string; readonly doneAt: Date | null; readonly deadline: Date | null; readonly now: Date; readonly doItNow: string; readonly id: string }): ReactElement {
  const state = breachDutyState(doneAt, deadline, now);
  const worry = state === "overdue" || state === "done_late";
  const clock = doneAt === null && deadline !== null ? breachClock(deadline, now) : null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink-2">{title}</p>
      <p className={`mt-1 text-sm font-medium ${worry ? "text-error" : ""}`}>{STATE_WORDS[state]}</p>
      {clock === null ? null : <StatusChip label={clock.text} variant={clock.late ? "failed" : "waiting"} className="mt-1.5 font-figure tabular-nums" />}
      <p className="mt-0.5 text-sm tabular-nums text-ink-2">
        {doneAt === null ? (
          deadline === null ? null : (
            <>
              by <LocalDateTime iso={deadline.toISOString()} variant="timestamp" />
            </>
          )
        ) : (
          <LocalDateTime iso={doneAt.toISOString()} variant="timestamp" />
        )}
      </p>
      {doneAt === null ? (
        <form action={updateBreachAction} className="mt-2">
          <input type="hidden" name="id" value={id} />
          <button type="submit" name="do" value={doItNow} className={BUTTON}>
            Mark as sent now
          </button>
        </form>
      ) : null}
    </div>
  );
}

function BreachRow({ breach, now }: { readonly breach: StoredBreach; readonly now: Date }): ReactElement {
  const deadlines = breachDeadlines(breach.detectedAt);
  return (
    <li className="border-b border-line py-5 pl-1 pr-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="min-w-0 max-w-2xl break-words font-semibold">{breach.summary}</p>
        <p className="text-sm tabular-nums text-ink-2">
          Found <LocalDateTime iso={breach.detectedAt.toISOString()} variant="timestamp" />
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {breach.status === "open" ? "Open" : breach.status === "contained" ? "Contained" : "Closed"}
        {breach.dataCategories.length === 0 ? "" : ` · ${breach.dataCategories.join(", ")}`}
      </p>
      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <Duty title="CERT-In (6 hours)" doneAt={breach.reportedCertInAt} deadline={deadlines.certInBy} now={now} doItNow="cert_in" id={breach.id} />
        <Duty title="Data Protection Board (72 hours)" doneAt={breach.reportedBoardAt} deadline={deadlines.boardReportBy} now={now} doItNow="board" id={breach.id} />
        <Duty title="People affected" doneAt={breach.peopleNotifiedAt} deadline={null} now={now} doItNow="people" id={breach.id} />
      </div>
      {breach.status === "closed" ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          {breach.status === "open" ? (
            <form action={updateBreachAction}>
              <input type="hidden" name="id" value={breach.id} />
              <button type="submit" name="do" value="contained" className={BUTTON}>
                Mark contained
              </button>
            </form>
          ) : null}
          <ConfirmDialog
            title="Close this breach"
            consequence="The breach is recorded as closed now. It stays in the register: nothing here can be deleted."
            triggerLabel="Close"
            triggerClassName={BUTTON}
            confirmLabel="Close breach"
            cancelLabel="Keep open"
            formAction={updateBreachAction}
          >
            <input type="hidden" name="id" value={breach.id} />
            <input type="hidden" name="do" value="closed" />
          </ConfirmDialog>
        </div>
      )}
    </li>
  );
}

export default async function BreachesPage({ searchParams }: { readonly searchParams: Promise<{ readonly problem?: string }> }): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "breach.view" });
  const [breaches, { problem }] = await Promise.all([listBreaches(getStaffDb()), searchParams]);
  const now = new Date();
  const shownProblem = problem !== undefined && BREACH_FORM_MESSAGES.includes(problem) ? problem : null;
  const openCount = breaches.filter((breach) => breach.status !== "closed").length;
  const overdueCount = breaches.filter((breach) => {
    const deadlines = breachDeadlines(breach.detectedAt);
    return (
      breachDutyState(breach.reportedCertInAt, deadlines.certInBy, now) === "overdue" ||
      breachDutyState(breach.reportedBoardAt, deadlines.boardReportBy, now) === "overdue"
    );
  }).length;

  return (
    <>
      <PageHeader
        title={<>Breach <em>register</em></>}
        meta="Every personal data breach, with when each report was made. Nothing here can be deleted. How to respond: vps-setup/BREACH-RESPONSE.md. The clocks start when the breach is found."
      />

      <StatTiles
        label="Breach figures"
        items={[
          { value: openCount, label: "Open breaches", note: openCount === 0 ? "None open" : "Not closed yet" },
          {
            value: overdueCount,
            label: "Reports overdue",
            note: overdueCount === 0 ? "None" : "CERT-In or the Board",
            tone: overdueCount === 0 ? "good" : "bad",
          },
          { value: breaches.length, label: "Logged in all" },
        ]}
      />

      <section className="mt-8 max-w-2xl">
        <h2 className="text-sm font-semibold">Log a breach</h2>
        <form action={logBreachAction} className="mt-3 grid gap-4">
          <div>
            <label htmlFor="breach-summary" className="block text-sm font-medium">
              What happened<RequiredMark />
            </label>
            <textarea id="breach-summary" name="summary" rows={3} required maxLength={2000} className={INPUT} />
            <p className="mt-1 text-xs text-ink-2">A few sentences. Do not put anyone&rsquo;s name or number here.</p>
          </div>
          <div>
            <label htmlFor="breach-detected" className="block text-sm font-medium">
              When it was found (India time)<RequiredMark />
            </label>
            <input id="breach-detected" name="detectedAt" type="datetime-local" required className={INPUT} />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Kinds of data involved</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {BREACH_DATA_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="category" value={category} className="size-4 accent-accent" />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>
          {shownProblem === null ? null : (
            <Notice tone="problem">{shownProblem}</Notice>
          )}
          <div>
            <GatedSubmitButton className={BUTTON} pendingLabel="Logging…">
              Log it
            </GatedSubmitButton>
          </div>
        </form>
      </section>

      {breaches.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No breaches logged." description="A breach appears here with its 6 hour and 72 hour clocks as soon as it is logged." />
        </div>
      ) : (
        <ul aria-label="Breaches" className="mt-10 border-t border-line">
          {breaches.map((breach) => (
            <BreachRow key={breach.id} breach={breach} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
