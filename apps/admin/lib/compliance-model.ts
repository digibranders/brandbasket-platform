import type { BreachStatus, PrivacyRequestOutcome, PrivacyRequestStatus, StoredBreach, StoredPrivacyRequest } from "@brandbasket/db";
import { breachDeadlines, breachDutyState, type BreachDutyState } from "@brandbasket/shared/lib/breach-deadlines";
import { requestUrgency } from "@brandbasket/shared/lib/privacy-request-deadlines";
import { breachClock, clockTone, requestClock, type ClockTone } from "./deadline-clock";

/*
 * The Compliance tabs' rows and clock strip as plain data. Pure: no database or server imports, so the pages build the rows
 * on the server and the client components only draw them. Types come from the db package as `import type` only.
 */

const STATUS_WORDS: Readonly<Record<PrivacyRequestStatus, string>> = {
  received: "Received",
  verifying: "Checking who they are",
  in_progress: "Being worked on",
  closed: "Closed",
};

const DUTY_WORDS: Readonly<Record<BreachDutyState, string>> = {
  done: "Done",
  done_on_time: "Done in time",
  done_late: "Done late",
  due: "Due",
  overdue: "Overdue",
  due_without_delay: "Owed without delay",
};

const BREACH_STATUS_WORDS: Readonly<Record<BreachStatus, string>> = { open: "Open", contained: "Contained", closed: "Closed" };

export interface PrivacyStep {
  readonly doValue: "verifying" | "identity_checked" | "in_progress";
  readonly label: string;
}

export interface PrivacyRow {
  readonly id: string;
  readonly reference: string;
  readonly kindLabel: string;
  readonly who: string;
  readonly channel: string;
  readonly details: string | null;
  readonly status: PrivacyRequestStatus;
  readonly statusWord: string;
  readonly receivedIso: string;
  readonly dueIso: string;
  readonly closedIso: string | null;
  readonly identityChecked: boolean;
  readonly closed: boolean;
  /** Null once closed. */
  readonly tone: ClockTone | null;
  readonly clockText: string;
  readonly closedLate: boolean;
  readonly outcomeText: string | null;
  readonly resolution: string | null;
  readonly steps: readonly PrivacyStep[];
}

/** The next moves on an open request, as the buttons the old page showed (without "Take this": there is one staff account). */
export function privacySteps(request: Pick<StoredPrivacyRequest, "status" | "identityVerifiedAt">): readonly PrivacyStep[] {
  if (request.status === "closed") return [];
  const steps: PrivacyStep[] = [];
  if (request.status === "received") steps.push({ doValue: "verifying", label: "Check who they are" });
  if (request.identityVerifiedAt === null) steps.push({ doValue: "identity_checked", label: "Identity checked" });
  else if (request.status !== "in_progress") steps.push({ doValue: "in_progress", label: "Start the work" });
  return steps;
}

export function privacyRow(
  request: StoredPrivacyRequest,
  now: Date,
  kindLabels: Readonly<Record<string, string>>,
  outcomeLabels: Readonly<Record<PrivacyRequestOutcome, string>>,
): PrivacyRow {
  const closed = request.status === "closed";
  const urgency = requestUrgency(request, now);
  return {
    id: request.id,
    reference: request.reference,
    kindLabel: kindLabels[request.kind] ?? request.kind,
    who: [request.subjectName, request.subjectContact].filter((part): part is string => part !== null && part !== "").join(", "),
    channel: request.channel === "staff" ? "a call or in person" : "email",
    details: request.details,
    status: request.status,
    statusWord: STATUS_WORDS[request.status],
    receivedIso: request.receivedAt.toISOString(),
    dueIso: request.dueAt.toISOString(),
    closedIso: request.closedAt === null ? null : request.closedAt.toISOString(),
    identityChecked: request.identityVerifiedAt !== null,
    closed,
    tone: closed ? null : clockTone(request.dueAt, now),
    clockText: closed ? (urgency === "done_late" ? "Closed late" : "Closed in time") : requestClock(request.dueAt, now).text,
    closedLate: urgency === "done_late",
    outcomeText: request.outcome === null ? null : outcomeLabels[request.outcome],
    resolution: request.resolution,
    steps: privacySteps(request),
  };
}

/** Open requests first, the soonest due (so the most overdue) at the top; then closed ones, the latest closed first. */
export function sortPrivacy(rows: readonly PrivacyRow[]): PrivacyRow[] {
  return [...rows].sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    if (!a.closed) return Date.parse(a.dueIso) - Date.parse(b.dueIso);
    return Date.parse(b.closedIso ?? b.dueIso) - Date.parse(a.closedIso ?? a.dueIso);
  });
}

export interface PrivacyCounts {
  readonly open: number;
  readonly closed: number;
  readonly late: number;
  readonly soon: number;
}

export function privacyCounts(rows: readonly PrivacyRow[]): PrivacyCounts {
  const open = rows.filter((row) => !row.closed);
  return { open: open.length, closed: rows.length - open.length, late: open.filter((row) => row.tone === "late").length, soon: open.filter((row) => row.tone === "soon").length };
}

export interface BreachDuty {
  readonly key: "cert_in" | "board" | "people";
  readonly title: string;
  readonly stateWord: string;
  readonly worry: boolean;
  readonly done: boolean;
  /** The clock text while a timed duty is still open, else null. */
  readonly clockText: string | null;
  readonly tone: ClockTone | null;
  /** When it was done, or its deadline while it is open; null for "People affected" before it is done. */
  readonly atIso: string | null;
}

export interface BreachRow {
  readonly id: string;
  readonly summary: string;
  readonly detectedIso: string;
  readonly status: BreachStatus;
  readonly statusWord: string;
  readonly categories: readonly string[];
  readonly duties: readonly BreachDuty[];
  readonly closed: boolean;
  /** A CERT-In or Board report is overdue. */
  readonly late: boolean;
}

function duty(key: BreachDuty["key"], title: string, doneAt: Date | null, deadline: Date | null, now: Date): BreachDuty {
  const state = breachDutyState(doneAt, deadline, now);
  const open = doneAt === null && deadline !== null;
  return {
    key,
    title,
    stateWord: DUTY_WORDS[state],
    worry: state === "overdue" || state === "done_late",
    done: doneAt !== null,
    clockText: open ? breachClock(deadline, now).text : null,
    tone: open ? clockTone(deadline, now) : null,
    atIso: doneAt !== null ? doneAt.toISOString() : deadline === null ? null : deadline.toISOString(),
  };
}

export function breachRow(breach: StoredBreach, now: Date): BreachRow {
  const deadlines = breachDeadlines(breach.detectedAt);
  const duties = [
    duty("cert_in", "CERT-In (6 hours)", breach.reportedCertInAt, deadlines.certInBy, now),
    duty("board", "Data Protection Board (72 hours)", breach.reportedBoardAt, deadlines.boardReportBy, now),
    duty("people", "People affected", breach.peopleNotifiedAt, null, now),
  ];
  return {
    id: breach.id,
    summary: breach.summary,
    detectedIso: breach.detectedAt.toISOString(),
    status: breach.status,
    statusWord: BREACH_STATUS_WORDS[breach.status],
    categories: breach.dataCategories,
    duties,
    closed: breach.status === "closed",
    late: duties.some((entry) => entry.stateWord === DUTY_WORDS.overdue),
  };
}

/** Open breaches first with a late report at the top, then the newest found; closed ones last. */
export function sortBreaches(rows: readonly BreachRow[]): BreachRow[] {
  return [...rows].sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    if (a.late !== b.late) return a.late ? -1 : 1;
    return Date.parse(b.detectedIso) - Date.parse(a.detectedIso);
  });
}

export interface ClockItem {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly tone: ClockTone;
}

const STRIP_LIMIT = 4;

/** The clocks that need staff first, across both registers: every running clock, soonest deadline (most overdue) first. */
export function complianceClocks(
  requests: readonly StoredPrivacyRequest[],
  breaches: readonly StoredBreach[],
  now: Date,
): { readonly items: readonly ClockItem[]; readonly running: number } {
  const all: { readonly at: number; readonly item: ClockItem }[] = [];
  for (const request of requests) {
    if (request.status === "closed") continue;
    all.push({ at: request.dueAt.getTime(), item: { id: `p-${request.id}`, label: `Privacy request ${request.reference}`, text: requestClock(request.dueAt, now).text, tone: clockTone(request.dueAt, now) } });
  }
  for (const breach of breaches) {
    if (breach.status === "closed") continue;
    const deadlines = breachDeadlines(breach.detectedAt);
    if (breach.reportedCertInAt === null) {
      all.push({ at: deadlines.certInBy.getTime(), item: { id: `c-${breach.id}`, label: "Breach, CERT-In report", text: breachClock(deadlines.certInBy, now).text, tone: clockTone(deadlines.certInBy, now) } });
    }
    if (breach.reportedBoardAt === null) {
      all.push({ at: deadlines.boardReportBy.getTime(), item: { id: `b-${breach.id}`, label: "Breach, Board report", text: breachClock(deadlines.boardReportBy, now).text, tone: clockTone(deadlines.boardReportBy, now) } });
    }
  }
  all.sort((a, b) => a.at - b.at);
  return { items: all.slice(0, STRIP_LIMIT).map((entry) => entry.item), running: all.length };
}

export interface ClosureRow {
  readonly businessId: string;
  readonly name: string;
  readonly ownerName: string | null;
  readonly closedIso: string;
  readonly eraseIso: string;
  readonly daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Accounts waiting to be erased, the soonest first. A closure whose business is not in `names` is still listed, by its id. */
export function closureRows(
  closures: readonly { readonly businessId: string; readonly requestedAt: Date; readonly eraseAfter: Date }[],
  names: ReadonlyMap<string, { readonly name: string; readonly ownerName: string | null }>,
  now: Date,
): ClosureRow[] {
  return closures
    .map((closure) => ({
      businessId: closure.businessId,
      name: names.get(closure.businessId)?.name ?? closure.businessId,
      ownerName: names.get(closure.businessId)?.ownerName ?? null,
      closedIso: closure.requestedAt.toISOString(),
      eraseIso: closure.eraseAfter.toISOString(),
      daysLeft: Math.max(0, Math.ceil((closure.eraseAfter.getTime() - now.getTime()) / DAY_MS)),
    }))
    .sort((a, b) => Date.parse(a.eraseIso) - Date.parse(b.eraseIso));
}
