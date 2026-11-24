import type { PillTone } from "@/components/console/status-pill";

/** The four review states of a grouped app error. Kept free of runtime imports so client components can use it. */
export const ERROR_STATUSES = ["new", "investigating", "resolved", "ignored"] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];

export const ERROR_STATUS_LABELS: Readonly<Record<ErrorStatus, string>> = { new: "New", investigating: "Investigating", resolved: "Resolved", ignored: "Ignored" };
export const ERROR_STATUS_TONES: Readonly<Record<ErrorStatus, PillTone>> = { new: "problem", investigating: "progress", resolved: "done", ignored: "todo" };

export type ErrorStatusResult =
  | { readonly ok: true; readonly previous: ErrorStatus; readonly occurrenceCount: number }
  | { readonly ok: false; readonly message: string };

/** The toast line after a status change: names the object. */
export function errorStatusToast(errorClass: string, status: ErrorStatus): string {
  return `${errorClass} marked ${ERROR_STATUS_LABELS[status].toLowerCase()}`;
}
