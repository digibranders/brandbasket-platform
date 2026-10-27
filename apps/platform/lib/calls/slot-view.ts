import type { CallReason } from "@brandbasket/db/call-reasons";
import { slotLabel, slotTime } from "@/lib/call-dates";

/** A day's times split at noon in India, each part in the order given. */
export interface DayTimes {
  readonly morning: readonly string[];
  readonly afternoon: readonly string[];
}

export function splitDayTimes(times: readonly string[]): DayTimes {
  return {
    morning: times.filter((iso) => Number(slotTime(iso).slice(0, 2)) < 12),
    afternoon: times.filter((iso) => Number(slotTime(iso).slice(0, 2)) >= 12),
  };
}

/** The words on the Book button: the answer to "what happens if I press it". */
export function bookButtonLabel(slot: string | null, booking: boolean): string {
  if (booking) return "Booking…";
  return slot === null ? "Pick a time" : `Book ${slotLabel(slot)}`;
}

/** The reason the sheet starts on: the one it was opened with if this customer may pick it, else the first option (Website). */
export function defaultReasonOf(options: readonly { readonly value: CallReason }[], wanted: CallReason | undefined): CallReason | undefined {
  return options.find((option) => option.value === wanted)?.value ?? options[0]?.value;
}
