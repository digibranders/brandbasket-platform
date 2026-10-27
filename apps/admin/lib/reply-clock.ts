import type { SupportStatus } from "@brandbasket/shared/lib/support";

/** Where a request sits for staff: someone owes the client a reply, the client owes us one, or it is finished. */
export type RequestQueue = "needs_reply" | "waiting_on_client" | "done";

export interface ReplyClockInput {
  readonly status: SupportStatus;
  /** The client's newest message. Clients only write public messages. */
  readonly lastCustomerMessageAt: Date | null;
  /** The newest public reply from staff. Internal notes are not replies. */
  readonly lastStaffReplyAt: Date | null;
}

export interface ReplyClock {
  readonly queue: RequestQueue;
  /** Since when the client has waited for a reply; null unless the request needs one. */
  readonly waitingSince: Date | null;
}

const FINISHED: ReadonlySet<SupportStatus> = new Set(["resolved", "closed"]);

/** The same rule as `needsReplySql` in packages/db/src/queries/support-staff.ts. Change both together. */
export function replyClock(input: ReplyClockInput): ReplyClock {
  if (FINISHED.has(input.status)) return { queue: "done", waitingSince: null };
  const customer = input.lastCustomerMessageAt;
  const staff = input.lastStaffReplyAt;
  if (customer !== null && (staff === null || customer > staff)) return { queue: "needs_reply", waitingSince: customer };
  return { queue: "waiting_on_client", waitingSince: null };
}

interface ClockMessage {
  readonly authorRole: "customer" | "staff";
  readonly visibility: "public" | "internal";
  readonly createdAt: Date;
}

function newest(messages: readonly ClockMessage[], keep: (message: ClockMessage) => boolean): Date | null {
  let found: Date | null = null;
  for (const message of messages) if (keep(message) && (found === null || message.createdAt > found)) found = message.createdAt;
  return found;
}

/** The clock for one ticket page, from the messages it already loaded. */
export function replyClockFromMessages(status: SupportStatus, messages: readonly ClockMessage[]): ReplyClock {
  return replyClock({
    status,
    lastCustomerMessageAt: newest(messages, (message) => message.authorRole === "customer"),
    lastStaffReplyAt: newest(messages, (message) => message.authorRole === "staff" && message.visibility === "public"),
  });
}

export type WaitingTone = "late" | "soon" | "ok";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Mock screen 6: over a day waiting is late (red), over four hours is soon (rattan). */
const LATE_AFTER_HOURS = 24;
const SOON_AFTER_HOURS = 4;

/** "45m", "26h" or "3d", with how urgent it is. */
export function waitingLabel(since: Date, now: Date): { readonly text: string; readonly tone: WaitingTone } {
  const ms = Math.max(0, now.getTime() - since.getTime());
  const hours = ms / HOUR_MS;
  const text = hours < 1 ? `${Math.floor(ms / MINUTE_MS)}m` : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
  const tone: WaitingTone = hours >= LATE_AFTER_HOURS ? "late" : hours >= SOON_AFTER_HOURS ? "soon" : "ok";
  return { text, tone };
}
