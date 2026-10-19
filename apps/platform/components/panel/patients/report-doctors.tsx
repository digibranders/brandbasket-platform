import type { ReactElement } from "react";
import type { PatientReportPractitioner } from "@brandbasket/db";

/** "By doctor": a plain hairline table, one row per doctor with bookings in the range or still active. */
export function ReportDoctors({ doctors }: { readonly doctors: readonly PatientReportPractitioner[] }): ReactElement {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Bookings by doctor</caption>
      <thead>
        <tr className="border-b border-line text-left text-ink-soft">
          <th scope="col" className="py-2 pr-4 font-normal">
            Doctor
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-normal">
            Bookings
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-normal">
            Attended
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-normal">
            No-shows
          </th>
        </tr>
      </thead>
      <tbody>
        {doctors.map((doctor) => (
          <tr key={doctor.id} className="border-b border-line last:border-b-0">
            <th scope="row" className="min-w-0 py-3 pr-4 text-left font-medium text-ink">
              <span className="break-words">{doctor.name}</span>
              {doctor.archived ? <span className="ml-2 text-xs font-normal text-ink-soft">Archived</span> : null}
            </th>
            <td className="py-3 pl-2 text-right text-ink tabular-nums">{doctor.bookings}</td>
            <td className="py-3 pl-2 text-right text-ink tabular-nums">{doctor.attended}</td>
            <td className="py-3 pl-2 text-right text-ink tabular-nums">{doctor.noShows}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
