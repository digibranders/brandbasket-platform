import type { ProjectStatus } from "@fynix/db";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@fynix/shared/lib/onboarding/steps";

export interface NextStepProject {
  readonly status: ProjectStatus;
  readonly slaDueAt: Date | null;
}

export interface NextStepInput {
  /** The tenant's open project, or null when there is none. Always null once the site is live. */
  readonly project: NextStepProject | null;
  readonly completedSteps: readonly OnboardingStepKey[];
  /** The live site, when there is one. See `readLiveWebsite`: going live closes the project, so this arrives on its own. */
  readonly liveWebsite: { readonly hostname: string } | null;
}

export type NextStep =
  | { readonly kind: "start-onboarding" }
  | { readonly kind: "continue-onboarding"; readonly completed: number; readonly total: number }
  | { readonly kind: "building"; readonly slaDueAt: Date | null }
  | { readonly kind: "on-hold" }
  /** A preview is waiting for the customer, or the changes they asked for are being made. */
  | { readonly kind: "review"; readonly changesRequested: boolean }
  | { readonly kind: "approved" }
  | { readonly kind: "live"; readonly hostname: string }
  | { readonly kind: "none" };

/**
 * The one thing the home screen asks the customer to do next. Statuses that belong to later phases (preview,
 * revisions and on) return "none": the card shows nothing rather than a guess. A live site wins over everything,
 * since by then the handover has happened and editing their own content is the only thing left to point at.
 */
export function nextStep({ project, completedSteps, liveWebsite }: NextStepInput): NextStep {
  if (liveWebsite !== null) return { kind: "live", hostname: liveWebsite.hostname };
  if (project === null) return { kind: "none" };

  switch (project.status) {
    case "onboarding": {
      const completed = ONBOARDING_STEPS.filter((step) => completedSteps.includes(step.key)).length;
      if (completed === 0) return { kind: "start-onboarding" };
      return { kind: "continue-onboarding", completed, total: ONBOARDING_STEPS.length };
    }
    case "submitted":
    case "building":
      return { kind: "building", slaDueAt: project.slaDueAt };
    case "on_hold":
      return { kind: "on-hold" };
    case "preview":
      return { kind: "review", changesRequested: false };
    case "revisions":
      return { kind: "review", changesRequested: true };
    case "approved":
      return { kind: "approved" };
    case "live":
    case "cancelled":
      return { kind: "none" };
  }
}
