import type {
  BusinessHoursRow,
  BusinessProfile,
  MediaAsset,
  PrimaryDomain,
  Project,
  ProjectBrief,
  Service,
  StepProgress,
} from "@firstfold/db";
import { fromStoredHours, type OpeningHours } from "@firstfold/shared/lib/onboarding/hours";
import type { ChecklistInput } from "@firstfold/shared/lib/onboarding/checklist";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@firstfold/shared/lib/onboarding/steps";

/** Everything the customer has told us, read in one tenant-scoped transaction. */
export interface OnboardingSnapshot {
  readonly project: Project | null;
  /** True once there is nothing left to edit: the project has left onboarding, or there is no open project. */
  readonly locked: boolean;
  readonly completed: readonly OnboardingStepKey[];
  readonly profile: BusinessProfile | null;
  readonly hours: readonly OpeningHours[];
  readonly services: readonly Service[];
  readonly brief: ProjectBrief | null;
  readonly domain: PrimaryDomain | null;
  readonly logo: MediaAsset | null;
  readonly photos: readonly MediaAsset[];
}

export function isOnboardingLocked(project: Pick<Project, "status"> | null): boolean {
  return project === null || project.status !== "onboarding";
}

/**
 * The steps to mark done. Once onboarding is sent every step is done, the review included, which is never
 * recorded on its own.
 */
export function completedStepKeys(progress: readonly StepProgress[], locked: boolean): OnboardingStepKey[] {
  if (locked) return ONBOARDING_STEPS.map((step) => step.key);
  const done = new Set(progress.filter((entry) => entry.completedAt !== null).map((entry) => entry.step));
  return ONBOARDING_STEPS.map((step) => step.key).filter((key) => done.has(key));
}

/**
 * One entry per day the editor can show; days with no hours given are absent. The editor has no split shifts, so a
 * day's first row wins: the earliest open period, since rows come ordered by opening time.
 */
export function openingHoursFromRows(rows: readonly BusinessHoursRow[]): OpeningHours[] {
  const byDay = new Map<number, OpeningHours>();
  for (const row of rows) {
    if (byDay.has(row.dayOfWeek)) continue;
    const day = fromStoredHours(row);
    if (day !== null) byDay.set(row.dayOfWeek, day);
  }
  return [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/** What the submission checklist needs, taken only from saved data. */
export function checklistInputFrom(snapshot: OnboardingSnapshot): ChecklistInput {
  const profile = snapshot.profile;
  return {
    displayName: profile?.displayName ?? null,
    phone: isBlank(profile?.phone) ? null : (profile?.phone ?? null),
    email: isBlank(profile?.email) ? null : (profile?.email ?? null),
    serviceCount: snapshot.services.length,
    logoCount: snapshot.logo === null ? 0 : 1,
    photoCount: snapshot.photos.length,
    undescribedPhotoCount: snapshot.photos.filter((photo) => isBlank(photo.altText)).length,
    domain:
      snapshot.domain === null
        ? null
        : { hostname: snapshot.domain.hostname, ownerConfirmed: snapshot.domain.ownerConfirmedAt !== null },
  };
}
