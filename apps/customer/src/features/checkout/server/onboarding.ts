import "server-only";
import {
  findOpenProject,
  getBusinessHours,
  getBusinessProfile,
  getPrimaryDomain,
  getProjectBrief,
  listMediaAssets,
  listServices,
  listStepProgress,
  OnboardingLockedError,
  submitProject,
  type Project,
  type ScopedTransaction,
} from "@brandbasket/db";
import { firstMissing, onboardingChecklist, type ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import {
  checklistInputFrom,
  completedStepKeys,
  isOnboardingLocked,
  openingHoursFromRows,
  type OnboardingSnapshot,
} from "@/features/checklist/rules-snapshot";

/*
 * The parts of apps/platform lib/server/onboarding.ts that paying needs: reading the setup answers to check them before a
 * website client pays, and sending them inside the first payment's transaction (payment-confirmation.ts). The checklist
 * screens (plan 61, /checklist) own saving answers.
 */

/** Why a payment was refused, for the page to show. `fixHref` is where the customer can put it right. */
export interface StepProblem {
  readonly message: string;
  readonly field: string | null;
  readonly fixHref?: string;
}

/** Where the setup answers are given in this app. */
const CHECKLIST_HREF = "/checklist";

/** Reads everything the customer has sent so far. Takes the caller's tenant-scoped transaction. */
export async function readOnboardingSnapshot(tx: ScopedTransaction): Promise<OnboardingSnapshot> {
  const project = await findOpenProject(tx);
  const locked = isOnboardingLocked(project);
  const progress = project === null ? [] : await listStepProgress(tx, project.id);
  const profile = await getBusinessProfile(tx);
  const hours = openingHoursFromRows(await getBusinessHours(tx));
  const services = await listServices(tx);
  const brief = project === null ? null : await getProjectBrief(tx, project.id);
  const domain = await getPrimaryDomain(tx);
  const logos = await listMediaAssets(tx, "logo");
  const photos = await listMediaAssets(tx, "photo");
  return {
    project,
    locked,
    completed: completedStepKeys(progress, locked),
    profile,
    hours,
    services,
    brief,
    domain,
    // Uploading a logo replaces the old one; if two ever overlap, the newest is the one the customer last chose.
    logo: logos.at(-1) ?? null,
    photos,
  };
}

/** What the checklist still needs, as a refusal pointing at the checklist. */
export function missingProblem(item: ChecklistItem): StepProblem {
  return {
    message: `Before you send this, we still need: ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}.`,
    field: null,
    fixHref: CHECKLIST_HREF,
  };
}

/** Thrown inside a transaction to roll back whatever it wrote and report `problem` instead. */
export class StepRefusedError extends Error {
  readonly problem: StepProblem;

  constructor(problem: StepProblem) {
    super(problem.message);
    this.name = "StepRefusedError";
    this.problem = problem;
  }
}

/**
 * The submission itself, inside a transaction the caller opened as the customer (withCustomerRole on the staff connection).
 * It moves the project to `submitted` and starts the 48-hour clock, then re-runs the checklist on data read inside the same
 * transaction. The status change comes first, so it waits for any save still in flight and every later save is refused.
 * Nothing posted by a form is used.
 *
 * Throws OnboardingLockedError when there is nothing open to send, and StepRefusedError (carrying the first missing item)
 * when the checklist fails: the caller must roll the transaction, or its savepoint, back on either.
 */
export async function sendOnboardingWithin(tx: ScopedTransaction, now: Date): Promise<Project> {
  const project = await findOpenProject(tx);
  if (project === null || isOnboardingLocked(project)) throw new OnboardingLockedError();
  const submitted = await submitProject(tx, { projectId: project.id, now });

  const missing = firstMissing(onboardingChecklist(checklistInputFrom(await readOnboardingSnapshot(tx))));
  if (missing !== null) throw new StepRefusedError(missingProblem(missing));
  return submitted;
}
