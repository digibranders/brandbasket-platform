"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { calendarDateIn, MAX_RECEIVED_DAYS_AGO, utcCalendarDate } from "@firstfold/shared/lib/billing/manual-payment-form";
import { fieldClasses } from "@/components/console/field-styles";

interface ReceivedDateInputProps {
  readonly id: string;
  readonly name: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function subscribe(): () => void {
  return () => undefined;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The date money arrived, defaulting to today and never later than it. "Today" is the admin's own: the server render
 * uses UTC, and the input is replaced with the browser's date straight after hydration. The server checks the date
 * again whatever this allows.
 */
export function ReceivedDateInput({ id, name }: ReceivedDateInputProps): ReactElement {
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, () => null);
  const now = new Date();
  const today = timeZone === null ? utcCalendarDate(now) : calendarDateIn(now, timeZone);
  const earliest =
    timeZone === null
      ? utcCalendarDate(new Date(now.getTime() - MAX_RECEIVED_DAYS_AGO * DAY_MS))
      : calendarDateIn(new Date(now.getTime() - MAX_RECEIVED_DAYS_AGO * DAY_MS), timeZone);
  return (
    <input
      // Remounts once the browser's zone is known, so the default follows it.
      key={timeZone ?? "server"}
      id={id}
      name={name}
      type="date"
      required
      defaultValue={today}
      max={today}
      min={earliest}
      className={fieldClasses}
    />
  );
}
