"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { formatCalendarDate, formatDueDate, formatTimestamp } from "../../lib/format";

interface LocalDateTimeProps {
  /** An ISO 8601 timestamp. */
  readonly iso: string;
}

interface LocalMomentProps extends LocalDateTimeProps {
  /**
   * `deadline` (the default) reads "Friday 18 September at 3:00 pm"; `timestamp` reads "18 Sept 2026, 3:00 pm",
   * with the year, for records.
   */
  readonly variant?: "deadline" | "timestamp";
}

function subscribe(): () => void {
  return () => undefined;
}

function useInBrowser(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * A moment in the reader's own time zone. The server does not know that zone, so the server render (and the
 * hydration pass) shows UTC, named as such, and the browser swaps in local time straight after.
 */
export function LocalDateTime({ iso, variant = "deadline" }: LocalMomentProps): ReactElement {
  const inBrowser = useInBrowser();
  const date = new Date(iso);
  const format = variant === "timestamp" ? formatTimestamp : formatDueDate;
  return <time dateTime={iso}>{inBrowser ? format(date) : format(date, "UTC")}</time>;
}

/** The calendar date of a moment, in the reader's own time zone once in the browser (UTC before that). */
export function LocalDate({ iso }: LocalDateTimeProps): ReactElement {
  const inBrowser = useInBrowser();
  const date = new Date(iso);
  return <time dateTime={iso}>{inBrowser ? formatCalendarDate(date) : formatCalendarDate(date, "UTC")}</time>;
}
