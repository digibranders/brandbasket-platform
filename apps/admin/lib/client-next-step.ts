import { PROJECT_STATUSES_PREVIEWABLE, type ClientDetail, type ClientProject } from "@brandbasket/db";
import { PROJECT_STATUSES_WAITING_ON_US } from "@brandbasket/shared/lib/project-status";
import { lateReason } from "@/lib/pipeline";

export type ClientNextStep = "preview" | "live" | null;

const SEND_PREVIEW_STATUSES: ReadonlySet<string> = new Set(PROJECT_STATUSES_PREVIEWABLE);

/** What we owe a client next on their build: the preview while we build, going live once they approved. */
export function clientNextStep(project: ClientProject | null): ClientNextStep {
  if (project === null || project.onboardingSubmittedAt === null) return null;
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
  /** The section on the Project tab to open at, or null for its top. */
  readonly anchor: "domain" | null;
}

/** The one line the Overview leads with. A domain move first, then the preview, then going live. */
export function overviewNextStep(client: Pick<ClientDetail, "project" | "movingTo">, now: Date): OverviewNextStep | null {
  if (client.movingTo !== null) return { label: "Move them to their own domain", anchor: "domain" };
  const step = clientNextStep(client.project);
  if (step === "preview") {
    const late = previewLateReason(client.project, now);
    return { label: late === null ? "Send the preview" : `Send the preview: ${late.toLowerCase()}`, anchor: null };
  }
  if (step === "live") return { label: "Go live", anchor: "domain" };
  return null;
}
