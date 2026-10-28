import type { CallReason } from "@brandbasket/db/call-reasons";
import { andList } from "@/lib/first-look";

/** What a call is about, as staff read it in the alert: the same words as the console's calls list. */
const REASON_NAMES: Readonly<Record<CallReason, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Search",
  billing: "Billing",
  other: "Something else",
};

const DAY_AND_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const TIME_ONLY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

/** "Wed 28 Oct, 3:30 pm to 4:00 pm India time": the staff team works in India time, whatever zone the customer booked in. */
export function callTimeText(startsAt: Date, endsAt: Date): string {
  return `${DAY_AND_TIME.format(startsAt)} to ${TIME_ONLY.format(endsAt)} India time`;
}

export interface CallAlertInput {
  readonly kind: "kickoff" | "call";
  /** True when the customer moved a call they had already booked: the alert says so and shows the time it was moved from. */
  readonly changed: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly previousStartsAt: Date | null;
  readonly previousEndsAt: Date | null;
  /** The services the plan pays for, by name. */
  readonly services: readonly string[];
  readonly meetingUrl: string | null;
  /** A call after the kickoff says what it is about and may carry the customer's note. */
  readonly reason: CallReason | null;
  readonly note: string | null;
}

/** The facts and text of the call alert; the meeting link is a line on the card. Empty values are left out by the card. */
export function callAlert(input: CallAlertInput): {
  readonly event: "kickoff_booked" | "kickoff_changed" | "call_booked" | "call_changed";
  readonly facts: readonly { readonly name: string; readonly value: string | null }[];
  readonly text: string | null;
} {
  const event = `${input.kind}_${input.changed ? "changed" : "booked"}` as const;
  const wasAt = input.previousStartsAt === null || input.previousEndsAt === null ? null : callTimeText(input.previousStartsAt, input.previousEndsAt);
  const services = andList(input.services);
  return {
    event,
    facts: [
      { name: "When", value: callTimeText(input.startsAt, input.endsAt) },
      { name: "Moved from", value: input.changed ? wasAt : null },
      { name: "About", value: input.reason === null ? null : REASON_NAMES[input.reason] },
      { name: "Services", value: services === "" ? null : services },
      { name: "Meeting link", value: input.meetingUrl },
    ],
    text: input.note === null || input.note.trim() === "" ? null : `Customer's note: ${input.note.trim()}`,
  };
}
