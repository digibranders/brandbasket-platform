/*
 * The clock on a rights or grievance request. DPDP Act 2023 s.13 and Rules 2025 r.14: answer a grievance within a
 * reasonable period that does not exceed 90 days. Fynix Digital's own target is 30 days from the day the request was received,
 * so a request that reaches day 90 has already gone far past what we promise. Staff are reminded at day 20 and again at
 * day 25 of the 30. The tracker is the staff console's Privacy requests page.
 */

export const REQUEST_TARGET_DAYS = 30;
export const REQUEST_CEILING_DAYS = 90;
/**
 * A complaint about something posted on the local directory (a review, a comment, a listing) is a grievance about content
 * Fynix hosts as an intermediary: IT (Intermediary Guidelines) Rules 2021 r.3(2)(a) give 15 days to resolve it. The
 * reference shown at once is the acknowledgement the same rule wants within 24 hours.
 */
export const CONTENT_GRIEVANCE_DAYS = 15;
const CONTENT_GRIEVANCE_KINDS: ReadonlySet<string> = new Set(["content_report", "listing_removal"]);
/** Days into the target at which a request is first flagged, then flagged as urgent. */
export const REMINDER_DAY = 20;
export const URGENT_DAY = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RequestDeadlines {
  readonly dueAt: Date;
  readonly legalCeilingAt: Date;
}

/** When a request received now is due by Fynix Digital's own target, and the latest the Act allows. */
export function requestDeadlines(receivedAt: Date): RequestDeadlines {
  return {
    dueAt: new Date(receivedAt.getTime() + REQUEST_TARGET_DAYS * DAY_MS),
    legalCeilingAt: new Date(receivedAt.getTime() + REQUEST_CEILING_DAYS * DAY_MS),
  };
}

/** `requestDeadlines` for a request of `kind`: a complaint about posted content is due in 15 days, everything else in 30. */
export function requestDeadlinesFor(kind: string, receivedAt: Date): RequestDeadlines {
  if (!CONTENT_GRIEVANCE_KINDS.has(kind)) return requestDeadlines(receivedAt);
  const dueAt = new Date(receivedAt.getTime() + CONTENT_GRIEVANCE_DAYS * DAY_MS);
  return { dueAt, legalCeilingAt: dueAt };
}

export type RequestUrgency = "on_track" | "reminder" | "urgent" | "overdue" | "done_on_time" | "done_late";

/**
 * Where a request stands. `dueAt` is its own deadline (a content report's is hours or days, not 30 days), so the reminder
 * and urgent points are worked out as 10 and 5 days before it: day 20 and day 25 of a 30-day request.
 */
export function requestUrgency(request: { readonly receivedAt: Date; readonly dueAt: Date; readonly closedAt: Date | null }, now: Date): RequestUrgency {
  if (request.closedAt !== null) return request.closedAt.getTime() <= request.dueAt.getTime() ? "done_on_time" : "done_late";
  const left = request.dueAt.getTime() - now.getTime();
  if (left < 0) return "overdue";
  const span = request.dueAt.getTime() - request.receivedAt.getTime();
  const reminderLeft = span * ((REQUEST_TARGET_DAYS - REMINDER_DAY) / REQUEST_TARGET_DAYS);
  const urgentLeft = span * ((REQUEST_TARGET_DAYS - URGENT_DAY) / REQUEST_TARGET_DAYS);
  if (left <= urgentLeft) return "urgent";
  if (left <= reminderLeft) return "reminder";
  return "on_track";
}

/** Whole days from now to the due date, rounded up; negative once past it. */
export function daysUntilDue(dueAt: Date, now: Date): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);
}
