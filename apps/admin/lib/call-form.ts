import { MAX_CALL_SUMMARY_LENGTH, MIN_CALL_SUMMARY_LENGTH } from "@brandbasket/db/call-reasons";
import type { SetupCallBooking, TeamCall } from "@brandbasket/db";

export type SummaryRead = { readonly ok: true; readonly summary: string | null } | { readonly ok: false };

/** Reads the "what was agreed" box. Empty clears the summary; anything else must be 3 to 600 characters. */
export function readSummary(value: unknown): SummaryRead {
  if (value !== null && value !== undefined && typeof value !== "string") return { ok: false };
  const text = (value ?? "").trim();
  if (text === "") return { ok: true, summary: null };
  return text.length < MIN_CALL_SUMMARY_LENGTH || text.length > MAX_CALL_SUMMARY_LENGTH ? { ok: false } : { ok: true, summary: text };
}

/** What the client page says after a call action (`?calls=` in its address). */
export const CALL_NOTICES = {
  held: { ok: true, text: "Call marked as held." },
  undone: { ok: true, text: "The mark was undone." },
  saved: { ok: true, text: "Saved. The customer can read it on their Calls page." },
  cleared: { ok: true, text: "Cleared." },
  gone: { ok: false, text: "That call has changed. Reload the page to see where it is." },
  invalid: { ok: false, text: `Write what was agreed in ${String(MIN_CALL_SUMMARY_LENGTH)} to ${String(MAX_CALL_SUMMARY_LENGTH)} characters, or leave the box empty to clear it.` },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type CallsNotice = keyof typeof CALL_NOTICES;

export function readCallsNotice(value: string | string[] | undefined): CallsNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(CALL_NOTICES, value) ? (value as CallsNotice) : null;
}

export function callNoticeLine(notice: CallsNotice): { readonly ok: boolean; readonly text: string } {
  return CALL_NOTICES[notice];
}

const REASON_LABELS: Readonly<Record<TeamCall["reason"], string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Search",
  billing: "Billing",
  other: "Something else",
};

/** One call in the console's Calls section. `key` is the call's id, or "kickoff". */
export interface StaffCallRow {
  readonly key: string;
  readonly startsAt: Date;
  readonly about: string;
  readonly status: string;
  /** Where the booking was made, for a call after the kickoff. */
  readonly from: string | null;
  /** What the customer wrote when they booked. */
  readonly note: string | null;
  readonly summary: string | null;
  readonly canMarkHeld: boolean;
  readonly canUndo: boolean;
  readonly canWrite: boolean;
}

/**
 * The calls staff see, newest first. The kickoff call is listed only once it is held: marking it held (and undoing that) is
 * the Kickoff call section's job, so this section only adds a place to write what was agreed.
 */
export function callRowsFor(input: {
  readonly calls: readonly TeamCall[];
  readonly kickoff: Pick<SetupCallBooking, "startsAt" | "heldAt" | "summary"> | null;
  readonly now: Date;
}): readonly StaffCallRow[] {
  const rows: StaffCallRow[] = input.calls.map((call) => {
    const started = call.startsAt <= input.now;
    return {
      key: call.id,
      startsAt: call.startsAt,
      about: REASON_LABELS[call.reason],
      status: call.status === "booked" ? (started ? "Booked" : "Booked, not started") : call.status === "held" ? "Held" : "Cancelled",
      from: call.source === "dashboard" ? "Dashboard" : "Cal.com page",
      note: call.note,
      summary: call.summary,
      canMarkHeld: call.status === "booked" && started,
      canUndo: call.status === "held",
      canWrite: call.status === "held",
    };
  });
  const kickoff = input.kickoff;
  if (kickoff !== null && kickoff.startsAt !== null && kickoff.heldAt !== null) {
    rows.push({ key: "kickoff", startsAt: kickoff.startsAt, about: "Kickoff", status: "Held", from: null, note: null, summary: kickoff.summary, canMarkHeld: false, canUndo: false, canWrite: true });
  }
  return rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}
