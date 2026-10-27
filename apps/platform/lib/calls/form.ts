import { isCallReason, MAX_CALL_NOTE_LENGTH, type CallReason } from "@brandbasket/db/call-reasons";

/** What every place that offers Book a call needs: the reasons this customer may pick, the booking page, and whether an invitation can reach them. */
export interface BookCallOptions {
  /** What a call can be about, in order (lib/requests/form.ts kindOptions). */
  readonly options: readonly { readonly value: CallReason; readonly label: string }[];
  /** The booking page staff set in the console, offered when the times cannot be listed here. */
  readonly bookingUrl: string | null;
  /** False for an account without a real email address: the invitation could not reach it. */
  readonly canBook: boolean;
}

export type BookCallRead =
  | { readonly ok: true; readonly reason: CallReason; readonly note: string | null }
  | { readonly ok: false; readonly message: string };

const REASON_MESSAGE = "Choose what the call is about.";
const NOTE_MESSAGE = `Keep the note to ${MAX_CALL_NOTE_LENGTH} characters or fewer.`;

/**
 * Reads what the Book a call sheet sends. `allowed` is the reasons this customer may pick (lib/requests/form.ts
 * kindOptions: the services they bought, then Billing and Something else), so a service they do not have is refused even if
 * the browser sends it. Every message here reaches the customer.
 */
export function readBookCall(input: { readonly reason: unknown; readonly note: unknown }, allowed: readonly CallReason[]): BookCallRead {
  if (!isCallReason(input.reason) || !allowed.includes(input.reason)) return { ok: false, message: REASON_MESSAGE };
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") return { ok: false, message: NOTE_MESSAGE };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > MAX_CALL_NOTE_LENGTH) return { ok: false, message: NOTE_MESSAGE };
  return { ok: true, reason: input.reason, note: note === "" ? null : note };
}
