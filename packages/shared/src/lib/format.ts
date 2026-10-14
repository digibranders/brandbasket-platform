/**
 * A deadline as people read it: "Friday 18 September at 3:00 pm", in the reader's own zone. Omit `timeZone` to use
 * the runtime's own.
 */
export function formatDueDate(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Due date must be a valid Date");
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * A moment for records, with the year: "16 Sep 2026, 3:00 pm", in the reader's own zone. Omit `timeZone` to use the
 * runtime's own.
 */
export function formatTimestamp(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Timestamp must be a valid Date");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * A stored calendar date (`YYYY-MM-DD`, no time and no zone) as people read it: "15 September 2026". It is shown
 * exactly as entered, never shifted into anyone's zone.
 */
export function formatStoredDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new RangeError(`Expected a YYYY-MM-DD date, received ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError(`Not a real calendar date: ${value}`);
  return formatCalendarDate(date, "UTC");
}

/**
 * A calendar date for receipts and renewal dates: "16 December 2026". Omit `timeZone` to use the runtime's own; the
 * day can differ between zones, so a server render should pass "UTC" and say so.
 */
export function formatCalendarDate(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Date must be a valid Date");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/** Zero-based index to a two-digit label: 0 -> "01". */
export function formatStepNumber(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Step index must be a non-negative integer, received ${index}`);
  }
  return String(index + 1).padStart(2, "0");
}
