import type { ClientProject } from "@brandbasket/db";

export type BuildPanelState = "none" | "waiting" | "active";

/** What the Build section shows. Status decides. Whether the old setup checklist was sent does not change it. */
export function buildPanelState(project: ClientProject | null): BuildPanelState {
  if (project === null) return "none";
  if (project.status === "onboarding") return "waiting";
  return "active";
}
