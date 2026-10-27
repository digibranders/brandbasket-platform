import { findSetupCallBooking, listTeamCalls } from "@brandbasket/db";
import { MAX_CALL_SUMMARY_LENGTH } from "@brandbasket/db/call-reasons";
import type { ReactElement } from "react";
import { markTeamCallHeldAction, saveCallSummaryAction, undoTeamCallHeldAction } from "@/app/(protected)/clients/[businessId]/call-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { callNoticeLine, callRowsFor, type CallsNotice } from "@/lib/call-form";
import { getStaffDb } from "@/lib/server/db";

const INDIA_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });

/**
 * The calls after the kickoff, on the client page: when, what it is about, what the customer wrote, and the buttons that mark
 * a call held and write what was agreed. The customer reads that line on their Calls page. The kickoff call is listed once it
 * is held, only so its summary can be written; marking it held stays in the Kickoff call section above.
 */
export async function CallsSection({ businessId, notice }: { readonly businessId: string; readonly notice: CallsNotice | null }): Promise<ReactElement> {
  const [calls, kickoff] = await Promise.all([listTeamCalls(getStaffDb(), businessId), findSetupCallBooking(getStaffDb(), businessId)]);
  const rows = callRowsFor({ calls, kickoff, now: new Date() });
  const line = notice === null ? null : callNoticeLine(notice);
  return (
    <Section title="Calls" id="calls">
      <p className="max-w-xl text-sm text-ink-soft">
        Calls the customer booked after the kickoff. Mark a call held once it has happened, then write what was agreed in a line or two: the customer reads it on their
        Calls page.
      </p>
      {line === null ? null : (
        <Notice tone={line.ok ? "ok" : "problem"} className="mt-4">
          {line.text}
        </Notice>
      )}
      {rows.length === 0 ? (
        <div className="mt-6">
          <Quiet>No calls after the kickoff yet.</Quiet>
        </div>
      ) : (
        <ul className="mt-6 max-w-2xl divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-3 py-4">
              <div>
                <p className="text-base text-ink">
                  <span className="tabular-nums">{INDIA_TIME.format(row.startsAt)}</span> India time
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {row.about} · {row.status}
                  {row.from === null ? "" : ` · Booked from the ${row.from}`}
                </p>
                {row.note === null ? null : <p className="mt-1 break-words text-sm text-ink">Customer wrote: {row.note}</p>}
              </div>
              {row.canMarkHeld ? (
                <form action={markTeamCallHeldAction}>
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="callId" value={row.key} />
                  <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
                    Mark as held
                  </button>
                </form>
              ) : null}
              {row.canWrite ? (
                <form action={saveCallSummaryAction} className="grid gap-2">
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="callId" value={row.key} />
                  <label htmlFor={`summary-${row.key}`} className={labelClasses}>
                    What was agreed
                  </label>
                  <textarea id={`summary-${row.key}`} name="summary" rows={3} maxLength={MAX_CALL_SUMMARY_LENGTH} defaultValue={row.summary ?? ""} className={fieldClasses} />
                  <div>
                    <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
                      Save
                    </button>
                  </div>
                </form>
              ) : null}
              {row.canUndo ? (
                <form action={undoTeamCallHeldAction}>
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="callId" value={row.key} />
                  <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
                    Undo
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
