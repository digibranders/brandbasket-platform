/** Helpers for the kickoff call's day-and-time picker. Pure and browser-safe. */

/** A day as `YYYY-MM-DD` in the given time zone (en-CA writes it that way). */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Slot start times (ISO) grouped by the day they fall on in `timeZone`, each day's times in order. */
export function groupSlotsByDay(slots: readonly string[], timeZone: string): ReadonlyMap<string, readonly string[]> {
  const days = new Map<string, string[]>();
  for (const iso of [...slots].sort()) {
    const key = dayKey(iso, timeZone);
    const day = days.get(key);
    if (day === undefined) days.set(key, [iso]);
    else day.push(iso);
  }
  return days;
}

/** The days of a month as week rows starting Monday; `null` pads the first and last week. `month` is 0 to 11. */
export function monthWeeks(year: number, month: number): readonly (readonly (number | null)[])[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, index) => index + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** `YYYY-MM-DD` for a day of a month (`month` 0 to 11). */
export function keyOf(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A calendar file (.ics) for a booked call, as a link a browser can download, so the customer can add it to their own calendar. */
export function callInviteHref(startIso: string, endIso: string): string {
  const stamp = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const file = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fynix Digital//Kickoff call//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(startIso)}@fynix.digital`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(startIso)}`,
    `DTEND:${stamp(endIso)}`,
    "SUMMARY:Fynix kickoff call",
    "DESCRIPTION:The video link is in your confirmation email.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(file)}`;
}
