/** Parses the Appointments module's settings forms: the message shown while paused, a service's name, and the
 * slot-booking grid settings (slot length, minimum notice, booking window). Appointments send no email of any
 * kind, so there is nothing here about who gets notified. Every length limit below counts UTF-16 code units, the
 * same as an HTML input's `maxlength`. */
import type { FormParseResult } from "../form-result";
import { textField } from "../form-result";
import { isSlotMinutes, type SlotMinutes } from "./slots";
import { cleanLine } from "../validation/text";

export const PAUSED_MESSAGE_MAX_LENGTH = 160;
export const SERVICE_NAME_MAX_LENGTH = 80;

export const MIN_NOTICE_MINUTES_OPTIONS = [0, 60, 120, 240, 1440] as const;
export type MinNoticeMinutes = (typeof MIN_NOTICE_MINUTES_OPTIONS)[number];

export function isMinNoticeMinutes(value: number): value is MinNoticeMinutes {
  return (MIN_NOTICE_MINUTES_OPTIONS as readonly number[]).includes(value);
}

export const HORIZON_DAYS_OPTIONS = [7, 14, 28, 56] as const;
export type HorizonDays = (typeof HORIZON_DAYS_OPTIONS)[number];

export function isHorizonDays(value: number): value is HorizonDays {
  return (HORIZON_DAYS_OPTIONS as readonly number[]).includes(value);
}

export interface SlotSettings {
  readonly slotMinutes: SlotMinutes;
  readonly minNoticeMinutes: MinNoticeMinutes;
  readonly horizonDays: HorizonDays;
}

/** Reads a whole-number field and checks it against `isValid`; a missing, non-numeric or out-of-range value fails
 * with `message`. */
function parseOption<T extends number>(
  formData: FormData,
  name: string,
  isValid: (value: number) => value is T,
  message: string,
): FormParseResult<T> {
  const raw = textField(formData, name).trim();
  const value = Number(raw);
  if (raw === "" || !Number.isInteger(value) || !isValid(value)) {
    return { success: false, field: name, message };
  }
  return { success: true, data: value };
}

/** `formData` must carry `slotMinutes`, `minNoticeMinutes` and `horizonDays`, each one of the published options
 * above (SLOT_MINUTE_OPTIONS, MIN_NOTICE_MINUTES_OPTIONS, HORIZON_DAYS_OPTIONS) -- all three come from a `<select>`
 * in the dashboard, so anything else means a tampered request rather than a typo to explain kindly. */
export function parseSlotSettings(formData: FormData): FormParseResult<SlotSettings> {
  const slotMinutes = parseOption(formData, "slotMinutes", isSlotMinutes, "Choose a slot length.");
  if (!slotMinutes.success) return slotMinutes;

  const minNoticeMinutes = parseOption(formData, "minNoticeMinutes", isMinNoticeMinutes, "Choose a minimum notice.");
  if (!minNoticeMinutes.success) return minNoticeMinutes;

  const horizonDays = parseOption(formData, "horizonDays", isHorizonDays, "Choose a booking window.");
  if (!horizonDays.success) return horizonDays;

  return {
    success: true,
    data: { slotMinutes: slotMinutes.data, minNoticeMinutes: minNoticeMinutes.data, horizonDays: horizonDays.data },
  };
}

export function parsePausedMessage(raw: string): FormParseResult<string | null> {
  const message = cleanLine(raw);
  if (message.length > PAUSED_MESSAGE_MAX_LENGTH) {
    return { success: false, field: "pausedMessage", message: `Keep the message to ${PAUSED_MESSAGE_MAX_LENGTH} characters.` };
  }
  return { success: true, data: message === "" ? null : message };
}

export function parseServiceName(raw: string): FormParseResult<string> {
  const name = cleanLine(raw);
  if (name.length < 1 || name.length > SERVICE_NAME_MAX_LENGTH) {
    return { success: false, field: "name", message: `Name the service in up to ${SERVICE_NAME_MAX_LENGTH} characters.` };
  }
  return { success: true, data: name };
}
