/** What the Project tab says after a staff move on a build. */
export type ProjectMoveNotice =
  | "building"
  | "held"
  | "resumed"
  | "cancelled"
  | "assigned"
  | "round-added"
  | "refused"
  | "reason-missing"
  | "confirm-missing"
  | "not-staff";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_MOVE_NOTICES: Readonly<Record<ProjectMoveNotice, { readonly text: string; readonly ok: boolean }>> = {
  building: { text: "Marked as building. The client sees it on their dashboard.", ok: true },
  held: { text: "Put on hold. The client sees the reason on their dashboard.", ok: true },
  resumed: { text: "Resumed. The build is back where it was before the hold.", ok: true },
  cancelled: { text: "Build cancelled. Their plan and billing are unchanged.", ok: true },
  assigned: { text: "Builder saved.", ok: true },
  "round-added": { text: "One more round of changes added.", ok: true },
  refused: { text: "Nothing changed: the build is no longer in a state that allows this. Refresh and try again.", ok: false },
  "reason-missing": { text: "Nothing changed: write the reason the client will see, in 200 characters or fewer.", ok: false },
  "confirm-missing": { text: "Nothing changed: tick the box to confirm you want to cancel this build.", ok: false },
  "not-staff": { text: "Nothing changed: that person is not active staff.", ok: false },
};

export function projectMoveNoticeHref(businessId: string, notice: ProjectMoveNotice): string {
  return `/clients/${businessId}/project?move=${notice}`;
}

export function readProjectMoveNotice(value: string | string[] | undefined): ProjectMoveNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_MOVE_NOTICES, value) ? (value as ProjectMoveNotice) : null;
}
