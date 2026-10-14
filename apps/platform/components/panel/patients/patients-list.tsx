import Link from "next/link";
import type { ReactElement } from "react";
import type { PatientListRow } from "@firstfold/db";
import { displayPhoneText } from "@firstfold/shared/server/phone-display";
import { countLabel, formatShortDate } from "@/app/app-host/(protected)/patients/view";

interface PatientsListProps {
  /** One page of the list, rendered exactly as given. */
  readonly rows: readonly PatientListRow[];
  /** The first row's serial number: 1 on page one, 26 on page two, and so on, so numbering runs on across pages
   * instead of restarting at 1 on each. */
  readonly firstNumber: number;
  /** Every matching patient across all pages -- the "of N" in each row's spoken label. */
  readonly total: number;
  readonly currentYear: number;
}

/** From md up the rows line up as columns under one header; below that each row stacks: name, phone, then the
 * figures on one line. The same cells serve both, the figures' wrapper dissolving into the grid (`md:contents`). */
const COLUMNS = "md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1.3fr)_4rem_minmax(0,1fr)_minmax(0,1.2fr)] md:gap-x-4";

function nextVisitText(row: PatientListRow, currentYear: number): string | null {
  if (row.nextLocalDate === null) return null;
  const date = formatShortDate(row.nextLocalDate, currentYear);
  return row.nextLocalStart === null ? date : `${date}, ${row.nextLocalStart}`;
}

/** Everything the row shows, spelled out once for assistive tech, e.g. "Patient 3 of 40: Arjun Menon, +91 98765
 * 43210, 4 visits, last visit 12 Sep, next visit 6 Oct, 10:00". */
function rowAriaLabel(row: PatientListRow, phoneText: string, srNo: number, total: number, currentYear: number): string {
  const last = row.lastVisitDate === null ? "" : `, last visit ${formatShortDate(row.lastVisitDate, currentYear)}`;
  const nextText = nextVisitText(row, currentYear);
  const next = nextText === null ? "" : `, next visit ${nextText}`;
  return `Patient ${String(srNo)} of ${String(total)}: ${row.name}, ${phoneText}, ${countLabel(row.visits, "visit", "visits")}${last}${next}`;
}

/** The register's rows: a hairline list, each row one link to that patient's profile. */
export function PatientsList({ rows, firstNumber, total, currentYear }: PatientsListProps): ReactElement {
  return (
    <div className="mt-3">
      <div aria-hidden="true" className={`hidden border-b border-line pb-2 text-xs font-medium text-ink-soft md:grid ${COLUMNS}`}>
        <span />
        <span>Name</span>
        <span>Phone</span>
        <span className="text-right">Visits</span>
        <span>Last visit</span>
        <span>Next visit</span>
      </div>
      <ol start={firstNumber} className="divide-y divide-line">
        {rows.map((row, index) => {
          const srNo = firstNumber + index;
          const phoneText = displayPhoneText(row.phone) ?? row.phone;
          const last = row.lastVisitDate === null ? null : formatShortDate(row.lastVisitDate, currentYear);
          const next = nextVisitText(row, currentYear);
          return (
            <li key={row.id}>
              <Link
                href={`/patients/${row.id}`}
                prefetch={false}
                aria-label={rowAriaLabel(row, phoneText, srNo, total, currentYear)}
                className={`-mx-2 grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 rounded-control px-2 py-3 text-[0.9375rem] transition-colors duration-300 ease-calm hover:bg-paper-deep/60 ${COLUMNS}`}
              >
                <span className="row-span-3 text-right text-xs tabular-nums text-ink-soft md:row-span-1">{srNo}.</span>
                <span className="truncate font-medium text-ink">{row.name}</span>
                <span className="col-start-2 truncate tabular-nums text-ink-soft md:col-start-auto">{phoneText}</span>
                <span className="col-start-2 flex flex-wrap gap-x-3 text-[0.8125rem] tabular-nums text-ink-soft md:col-start-auto md:contents md:text-[0.9375rem]">
                  <span className="tabular-nums md:text-right md:text-ink">
                    {row.visits}
                    <span className="md:hidden"> {row.visits === 1 ? "visit" : "visits"}</span>
                  </span>
                  {last === null ? (
                    <span className="hidden md:inline">–</span>
                  ) : (
                    <span>
                      <span className="md:hidden">Last </span>
                      {last}
                    </span>
                  )}
                  {next === null ? (
                    <span className="hidden md:inline">–</span>
                  ) : (
                    <span className="text-accent-deep">
                      <span className="md:hidden">Next </span>
                      {next}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
