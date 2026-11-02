import { PROJECT_STATUSES_PREVIEWABLE, type ClientDetail, type ClientProject } from "@brandbasket/db";
import { PROJECT_STATUSES_WAITING_ON_US } from "@brandbasket/shared/lib/project-status";
import { NEXT_STEP_HEADLINES } from "@/lib/delivery-tab";
import { lateReason } from "@/lib/pipeline";

export type ClientNextStep = "preview" | "live" | null;

const SEND_PREVIEW_STATUSES: ReadonlySet<string> = new Set(PROJECT_STATUSES_PREVIEWABLE);

/**
 * What we owe a client next on their build: the preview while we build, going live once they approved.
 * Status decides. onboardingSubmittedAt is only history of the old setup checklist, so kickoff-first projects still get it.
 */
export function clientNextStep(project: ClientProject | null): ClientNextStep {
  if (project === null) return null;
  if (SEND_PREVIEW_STATUSES.has(project.status)) return "preview";
  return project.status === "approved" ? "live" : null;
}

/** Same rule as the Journey's ring: a promised preview we still owe, past its date. Null when it is not late. */
export function previewLateReason(project: ClientProject | null, now: Date): string | null {
  if (project === null || project.slaDueAt === null) return null;
  if (!PROJECT_STATUSES_WAITING_ON_US.includes(project.status)) return null;
  if (project.slaDueAt.getTime() >= now.getTime()) return null;
  return lateReason(project.slaDueAt, now);
}

export interface OverviewNextStep {
  readonly label: string;
  /** The section on the Website tab to open at, or null for its top. */
  readonly anchor: "domain" | null;
}

/**
 * The one line the Overview leads with. A domain move first, then the build or preview, then going live. The words are
 * the Website tab's next-step card headline for the same stage (NEXT_STEP_HEADLINES), so the two never disagree.
 */
export function overviewNextStep(client: Pick<ClientDetail, "project" | "movingTo">, now: Date): OverviewNextStep | null {
  if (client.movingTo !== null) return { label: "Move them to their own domain", anchor: "domain" };
  const { project } = client;
  const step = clientNextStep(project);
  if (project === null || step === null) return null;
  if (step === "live") return { label: NEXT_STEP_HEADLINES[project.status], anchor: "domain" };
  const late = previewLateReason(project, now);
  return { label: `${NEXT_STEP_HEADLINES[project.status]}${late === null ? "" : `: ${late.toLowerCase()}`}`, anchor: null };
}
