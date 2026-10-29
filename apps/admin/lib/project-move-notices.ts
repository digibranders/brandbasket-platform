/** What the Project tab says after a staff move on a build. */
export type ProjectMoveNotice =
  | "cancelled"
  | "assigned"
  | "round-added"
  | "launch-planned"
  | "launch-day-invalid"
  | "refused"
  | "confirm-missing"
  | "not-staff";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_MOVE_NOTICES: Readonly<Record<ProjectMoveNotice, { readonly text: string; readonly ok: boolean }>> = {
  cancelled: { text: "Build cancelled. Their plan and billing are unchanged.", ok: true },
  assigned: { text: "Builder saved.", ok: true },
  "round-added": { text: "One more round of changes added.", ok: true },
  "launch-planned": { text: "Launch day saved. The client sees it on their website page.", ok: true },
  "launch-day-invalid": { text: "Nothing changed: choose a real day, or clear the field to remove it.", ok: false },
  refused: { text: "Nothing changed: the build is no longer in a state that allows this. Refresh and try again.", ok: false },
  "confirm-missing": { text: "Nothing changed: tick the box to confirm you want to cancel this build.", ok: false },
  "not-staff": { text: "Nothing changed: that person is not active staff.", ok: false },
};

export function projectMoveNoticeHref(businessId: string, notice: ProjectMoveNotice): string {
  return `/clients/${businessId}/project?move=${notice}`;
}

export function readProjectMoveNotice(value: string | string[] | undefined): ProjectMoveNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_MOVE_NOTICES, value) ? (value as ProjectMoveNotice) : null;
}
