import type { ReactElement } from "react";
import type { PatientReport } from "@brandbasket/db";
import { ReportColumnChart, type ReportColumn, type ReportSeries } from "./report-column-chart";

/*
 * The Reports page's three column charts, each turning one part of a PatientReport into ReportColumnChart's
 * columns plus a one-line summary for screen readers. Labels are short on the axis and whole in the tooltip and
 * the hidden table.
 */

/** en-US, not en-GB: newer ICU spells September "Sept" in en-GB, one letter too many for a phone-width axis. */
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Past this many hour columns the axis labels every second hour, past HOURS_LABEL_EVERY_THIRD every third. */
const HOURS_LABEL_EVERY_SECOND = 10;
const HOURS_LABEL_EVERY_THIRD = 16;

function monthDate(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** The column with the highest first-series value, first one on a tie; null when every value is 0. */
function peak(columns: readonly ReportColumn[], seriesIndex = 0): ReportColumn | null {
  let best: ReportColumn | null = null;
  for (const column of columns) {
    const value = column.values[seriesIndex] ?? 0;
    if (value > 0 && (best === null || value > (best.values[seriesIndex] ?? 0))) best = column;
  }
  return best;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

const MONTH_SERIES: readonly ReportSeries[] = [
  { label: "New patients", tone: "secondary" },
  { label: "Visits", tone: "primary" },
];

export function ReportMonthChart({ months }: { readonly months: PatientReport["months"] }): ReactElement {
  const columns: readonly ReportColumn[] = months.map((entry) => ({
    key: entry.month,
    axisLabel: MONTH_SHORT.format(monthDate(entry.month)),
    fullLabel: MONTH_LONG.format(monthDate(entry.month)),
    values: [entry.newPatients, entry.visits],
  }));
  const first = columns[0];
  const last = columns.at(-1);
  const busiest = peak(columns, 1);
  const span = first === undefined || last === undefined ? "" : ` from ${first.fullLabel} to ${last.fullLabel}`;
  const high = busiest === null ? "" : ` Most visits: ${busiest.fullLabel}, ${String(busiest.values[1] ?? 0)}.`;
  const newTotal = months.reduce((sum, entry) => sum + entry.newPatients, 0);
  const visitTotal = months.reduce((sum, entry) => sum + entry.visits, 0);

  return (
    <ReportColumnChart
      summary={`New patients and visits per month${span}: ${plural(newTotal, "new patient", "new patients")}, ${plural(visitTotal, "visit", "visits")}.${high}`}
      caption="New patients and visits by month"
      categoryHeading="Month"
      series={MONTH_SERIES}
      columns={columns}
      maxColumnWidth={88}
    />
  );
}

const BOOKINGS_SERIES: readonly ReportSeries[] = [{ label: "Bookings", tone: "primary" }];

export function ReportWeekdayChart({ weekdays }: { readonly weekdays: PatientReport["weekdays"] }): ReactElement {
  const columns: readonly ReportColumn[] = WEEKDAYS.map((day, index) => ({
    key: day,
    axisLabel: day.slice(0, 3),
    fullLabel: day,
    values: [weekdays[index] ?? 0],
  }));
  const busiest = peak(columns);
  const high = busiest === null ? "" : ` Busiest: ${busiest.fullLabel}, ${plural(busiest.values[0] ?? 0, "booking", "bookings")}.`;

  return (
    <ReportColumnChart
      summary={`Bookings by day of the week.${high}`}
      caption="Bookings by day of the week"
      categoryHeading="Day"
      series={BOOKINGS_SERIES}
      columns={columns}
      maxColumnWidth={72}
      showValues
    />
  );
}

/** Only the span from the earliest to the latest booked hour: a clinic's night hours are never worth a column. */
export function ReportHourChart({ hours }: { readonly hours: PatientReport["hours"] }): ReactElement | null {
  const busy = hours.filter((entry) => entry.count > 0);
  const firstHour = busy[0]?.hour;
  const lastHour = busy.at(-1)?.hour;
  if (firstHour === undefined || lastHour === undefined) return null;
  const shown = hours.filter((entry) => entry.hour >= firstHour && entry.hour <= lastHour);
  const every = shown.length > HOURS_LABEL_EVERY_THIRD ? 3 : shown.length > HOURS_LABEL_EVERY_SECOND ? 2 : 1;
  const columns: readonly ReportColumn[] = shown.map((entry) => ({
    key: String(entry.hour),
    axisLabel: (entry.hour - firstHour) % every === 0 ? String(entry.hour).padStart(2, "0") : "",
    fullLabel: hourLabel(entry.hour),
    values: [entry.count],
  }));
  const busiest = peak(columns);
  const high = busiest === null ? "" : ` Busiest: ${busiest.fullLabel}, ${plural(busiest.values[0] ?? 0, "booking", "bookings")}.`;

  return (
    <ReportColumnChart
      summary={`Bookings by starting hour, ${hourLabel(firstHour)} to ${hourLabel(lastHour)}.${high}`}
      caption="Bookings by starting hour"
      categoryHeading="Hour"
      series={BOOKINGS_SERIES}
      columns={columns}
      maxColumnWidth={56}
    />
  );
}
