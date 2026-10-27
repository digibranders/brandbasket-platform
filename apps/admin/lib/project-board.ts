import type { StaffProjectRow } from "@brandbasket/db";
import { clock, isSameTeamDay, shortDate, weekdayDate } from "./team-time";

type ProjectStatus = StaffProjectRow["status"];

export type BoardColumnKey = "setting-up" | "building" | "preview" | "changes" | "on-hold" | "live";

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
  { key: "setting-up", label: "Waiting for call" },
  { key: "building", label: "Building" },
  { key: "preview", label: "Preview sent" },
  { key: "changes", label: "Changes" },
  { key: "on-hold", label: "On hold" },
  { key: "live", label: "Live this month" },
];

const COLUMN_OF: Readonly<Record<ProjectStatus, BoardColumnKey | null>> = {
  onboarding: "setting-up",
  submitted: "building",
  building: "building",
  preview: "preview",
  approved: "preview",
  revisions: "changes",
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

/** The six board columns in order, each card placed by status. Cancelled builds are not shown. Rows keep their order. */
export function boardColumns(rows: readonly StaffProjectRow[], now: Date): readonly BoardColumn[] {
  return COLUMNS.map(({ key, label }) => ({
    key,
    label,
    cards: rows.filter((row) => COLUMN_OF[row.status] === key).map((row) => card(row, now)),
  }));
}

/** null keeps every row; "none" keeps rows with no builder; anything else is a staff user id. */
export function filterByBuilder(rows: readonly StaffProjectRow[], builder: string | null): readonly StaffProjectRow[] {
  if (builder === null) return rows;
  if (builder === "none") return rows.filter((row) => row.builderId === null);
  return rows.filter((row) => row.builderId === builder);
}
