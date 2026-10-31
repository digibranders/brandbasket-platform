import type { ProjectStatus, StaffProjectRow } from "@brandbasket/db";
import { STAFF_STAGE_LABELS, staffStageOf, type StaffStage } from "@brandbasket/shared/lib/project-stage";
import { clock, isSameTeamDay, shortDate, weekdayDate } from "./team-time";

export type BoardColumnKey =
  | "waiting-kickoff"
  | "ready"
  | "building"
  | "awaiting-review"
  | "changes"
  | "approved"
  | "on-hold"
  | "live";

export interface BoardCard {
  readonly row: StaffProjectRow;
  /** The line under the business name. */
  readonly note: string;
  /** The date on the card's right, or "" when there is none. */
  readonly due: string;
  readonly late: boolean;
  readonly dueSoon: boolean;
}

export interface BoardColumn {
  readonly key: BoardColumnKey;
  readonly label: string;
  readonly cards: readonly BoardCard[];
}

const COLUMNS: readonly { readonly key: BoardColumnKey; readonly label: string }[] = [
  { key: "waiting-kickoff", label: STAFF_STAGE_LABELS.waiting_for_kickoff },
  { key: "ready", label: STAFF_STAGE_LABELS.ready_to_start },
  { key: "building", label: STAFF_STAGE_LABELS.building },
  { key: "awaiting-review", label: STAFF_STAGE_LABELS.awaiting_review },
  { key: "changes", label: STAFF_STAGE_LABELS.changes_requested },
  { key: "approved", label: STAFF_STAGE_LABELS.approved },
  { key: "on-hold", label: STAFF_STAGE_LABELS.on_hold },
  { key: "live", label: "Live this month" },
];

const COLUMN_OF_STAGE: Readonly<Record<StaffStage, BoardColumnKey | null>> = {
  waiting_for_kickoff: "waiting-kickoff",
  ready_to_start: "ready",
  building: "building",
  awaiting_review: "awaiting-review",
  changes_requested: "changes",
  approved: "approved",
  on_hold: "on-hold",
  live: "live",
  cancelled: null,
};

function callNote(start: Date | null, now: Date): string {
  if (start === null) return "No call booked";
  return isSameTeamDay(start, now) ? `Call today ${clock(start)}` : `Call ${weekdayDate(start)}, ${clock(start)}`;
}

function card(row: StaffProjectRow, now: Date): BoardCard {
  const builder = row.builderName ?? "No builder";
  switch (row.status) {
    case "onboarding":
      return { row, note: callNote(row.callStartsAt, now), due: "", late: false, dueSoon: false };
    case "submitted":
    case "building": {
      if (row.slaDueAt === null) return { row, note: builder, due: "", late: false, dueSoon: false };
      const late = row.slaDueAt.getTime() < now.getTime();
      const today = !late && isSameTeamDay(row.slaDueAt, now);
      return { row, note: builder, due: today ? "due today" : `due ${shortDate(row.slaDueAt)}`, late, dueSoon: today };
    }
    case "preview":
      return { row, note: "Waiting for the client", due: row.previewSentAt === null ? "" : `sent ${shortDate(row.previewSentAt)}`, late: false, dueSoon: false };
    case "approved":
      return { row, note: "Approved, ready to go live", due: "", late: false, dueSoon: false };
    case "revisions":
      return { row, note: `Round ${row.revisionRoundsUsed} of ${row.revisionRoundsIncluded} · ${builder}`, due: "", late: false, dueSoon: false };
    case "on_hold":
      return { row, note: row.onHoldReason ?? "On hold", due: "", late: false, dueSoon: false };
    case "live":
      return { row, note: row.launchedAt === null ? "Live" : `Live ${shortDate(row.launchedAt)}`, due: "", late: false, dueSoon: false };
    case "cancelled":
      return { row, note: "", due: "", late: false, dueSoon: false };
  }
}

/** The eight board columns in order, each card placed by its staff stage. Cancelled builds are not shown. Rows keep their order. */
export function boardColumns(rows: readonly StaffProjectRow[], now: Date): readonly BoardColumn[] {
  return COLUMNS.map(({ key, label }) => ({
    key,
    label,
    cards: rows.filter((row) => COLUMN_OF_STAGE[staffStageOf(row.status)] === key).map((row) => card(row, now)),
  }));
}

/** null keeps every row; "none" keeps rows with no builder; anything else is a staff user id. */
export function filterByBuilder(rows: readonly StaffProjectRow[], builder: string | null): readonly StaffProjectRow[] {
  if (builder === null) return rows;
  if (builder === "none") return rows.filter((row) => row.builderId === null);
  return rows.filter((row) => row.builderId === builder);
}

export type ProjectScope = "needs-action" | "late" | "on-hold" | "all";

const SCOPES: readonly ProjectScope[] = ["needs-action", "late", "on-hold", "all"];
const NEEDS_ACTION_STATUSES: readonly ProjectStatus[] = ["submitted", "building", "revisions", "approved", "on_hold"];
/** Statuses where the first preview clock runs; sla_due_at is the promise they are late against. */
const CLOCK_RUNNING_STATUSES: readonly ProjectStatus[] = ["submitted", "building"];

/** The default scope is needs-action, so an unknown or missing value reads as that. */
export function parseProjectScope(value: string | undefined): ProjectScope {
  return SCOPES.find((scope) => scope === value) ?? "needs-action";
}

/** Narrows rows to one quick filter. "late" uses the same clock as the card, so a late card and a late row agree. */
export function filterByScope(rows: readonly StaffProjectRow[], scope: ProjectScope, now: Date): readonly StaffProjectRow[] {
  switch (scope) {
    case "all":
      return rows;
    case "needs-action":
      return rows.filter((row) => NEEDS_ACTION_STATUSES.includes(row.status));
    case "late":
      return rows.filter(
        (row) => CLOCK_RUNNING_STATUSES.includes(row.status) && row.slaDueAt !== null && row.slaDueAt.getTime() < now.getTime(),
      );
    case "on-hold":
      return rows.filter((row) => row.status === "on_hold");
  }
}
