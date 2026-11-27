import { addDays } from "./week-days";

/** One cell of a month's grid: a calendar day, and whether it belongs to the month shown (the rest are the days of the weeks either side). */
export interface GridDay {
  readonly day: string;
  readonly inMonth: boolean;
}

/** `YYYY-MM` of a `YYYY-MM-DD` day. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** The month `by` months from `month` (`YYYY-MM`), whichever year it falls in. */
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (number - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The weeks of a month, Monday first, as whole weeks (35 or 42 days) so the grid never changes height by more than a row. */
export function monthGrid(month: string): GridDay[] {
  const first = `${month}-01`;
  // 0 = Monday … 6 = Sunday.
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const next = shiftMonth(month, 1);
  const length = Math.round((Date.parse(`${next}-01T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
  const weeks = Math.ceil((offset + length) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = addDays(first, i - offset);
    return { day, inMonth: monthOf(day) === month };
  });
}

/** "December 2026", from `YYYY-MM`. */
export const monthTitle = (month: string): string => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00Z`));

/** An `HH:MM` time as its 12-hour parts, and back. The hour is 1 to 12. */
export function splitTime(time: string): { readonly hour: number; readonly minute: number; readonly pm: boolean } {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

export function joinTime(parts: { readonly hour: number; readonly minute: number; readonly pm: boolean }): string {
  const hour = (parts.hour % 12) + (parts.pm ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
