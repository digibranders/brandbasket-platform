import "server-only";
import {
  findLatestProject,
  findOpenProject,
  getBusinessHours,
  getBusinessProfile,
  getPrimaryDomain,
  getProjectBrief,
  listMediaAssets,
  listServices,
  listStepProgress,
  markStepComplete,
  OnboardingLockedError,
  ProjectNotInOnboardingError,
  submitProject,
  withTenantScope,
  type Database,
  type Project,
  type ProjectStatus,
  type ScopedTransaction,
} from "@brandbasket/db";
import { cache } from "react";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { firstMissing, onboardingChecklist, type ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import {
  checklistInputFrom,
  completedStepKeys,
  isOnboardingLocked,
  openingHoursFromRows,
  type OnboardingSnapshot,
} from "@/lib/onboarding/snapshot";
import { onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";
import { notifyTeamOnboardingSent } from "./onboarding-alert";

/** Why a step was not saved, for the form to show. `field` is the exact form field name, when there is one. */
export interface StepProblem {
  readonly message: string;
  readonly field: string | null;
  readonly fixHref?: string;
}

const LOCKED_PROBLEM: StepProblem = { message: ONBOARDING_LOCKED_MESSAGE, field: null };

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

/**
 * The signed-in customer's onboarding data, read once per request: the onboarding layout and its page both ask
 * for it. Server actions must not call this; they read inside their own transaction.
 */
export const getOnboardingSnapshot = cache(async (): Promise<OnboardingSnapshot> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, readOnboardingSnapshot);
});

export interface ProjectOverview {
  readonly project: Project | null;
  readonly completed: readonly OnboardingStepKey[];
}

/**
 * Just the project and the finished steps, without reading every answer. Read once per request: the layout's banner
 * and the home screen both ask for it.
 *
 * Excludes `live`/`cancelled` projects (it's built on `findOpenProject`) — see `getLatestProjectStatus` when the
 * caller needs to know whether the site has gone live.
 */
export const getProjectOverview = cache(async (): Promise<ProjectOverview> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const project = await findOpenProject(tx);
    const progress = project === null ? [] : await listStepProgress(tx, project.id);
    return { project, completed: completedStepKeys(progress, isOnboardingLocked(project)) };
  });
});

export interface LiveWebsite {
  /** The address the site is served at, their own domain or the free `*.brandbasket.in` one they started on. */
  readonly hostname: string;
  /** When the team put it live. Null for a project that went live before launches were stamped. */
  readonly launchedAt: Date | null;
}

/**
 * The customer's website once it is theirs to edit, or null while it is still being built. Built on
 * `findLatestProject`, not `findOpenProject`: going live closes the project, so from that moment
 * `getProjectOverview`'s `project` is null and this is the only thing that still knows the site exists.
 *
 * Takes the caller's tenant-scoped transaction, like `readOnboardingSnapshot`. `getLiveWebsite` is the
 * request-scoped reader that opens one.
 */
export async function readLiveWebsite(tx: ScopedTransaction): Promise<LiveWebsite | null> {
  const project = await findLatestProject(tx);
  if (project === null || project.status !== "live") return null;
  const domain = await getPrimaryDomain(tx);
  // Can't happen through the admin's Mark live action, which refuses a business with no primary domain. Handled
  // anyway because there is no address to hand over without one, and a live card with a dead link is worse than none.
  if (domain === null) return null;
  return { hostname: domain.hostname, launchedAt: project.launchedAt };
}

/** The live site for the signed-in customer. Read once per request: the home screen and Your project both ask. */
export const getLiveWebsite = cache(async (): Promise<LiveWebsite | null> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, readLiveWebsite);
});

/**
 * The tenant's current project status, or null when no project has ever been created (onboarding never started).
 * Unlike `getProjectOverview` (built on `findOpenProject`, which excludes `live` and `cancelled` projects because
 * those are no longer "open" for onboarding purposes), this also sees a project that has gone live — read this,
 * not `getProjectOverview`, wherever the caller genuinely needs to know whether the business's website is live.
 * Read once per request: the Monitoring page asks for it.
 */
export const getLatestProjectStatus = cache(async (): Promise<ProjectStatus | null> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const project = await findLatestProject(tx);
    return project?.status ?? null;
  });
});

/** Thrown inside a transaction to roll back whatever it wrote and report `problem` instead. */
export class StepRefusedError extends Error {
  readonly problem: StepProblem;

  constructor(problem: StepProblem) {
    super(problem.message);
    this.name = "StepRefusedError";
    this.problem = problem;
  }
}

export type StepWork = (tx: ScopedTransaction, project: Project) => Promise<StepProblem | null>;

/** Turns an error a step's save can expect into something to show, or null to let it propagate. */
export type StepErrorDescriber = (error: unknown) => StepProblem | null;

/**
 * Saves one answer step and marks it complete, all in one tenant-scoped transaction. `work` returns a problem to
 * refuse the save, and everything it wrote is rolled back. Once onboarding has been sent the database refuses
 * every save, and that surfaces here as the locked notice. Returns null when the step was saved.
 */
export async function saveOnboardingStep(
  db: Database,
  tenant: TenantContext,
  step: Exclude<OnboardingStepKey, "review">,
  work: StepWork,
  describeError: StepErrorDescriber = () => null,
): Promise<StepProblem | null> {
  try {
    await withTenantScope(db, tenant, async (tx) => {
      const project = await findOpenProject(tx);
      if (project === null || isOnboardingLocked(project)) throw new OnboardingLockedError();
      const problem = await work(tx, project);
      if (problem !== null) throw new StepRefusedError(problem);
      await markStepComplete(tx, project.id, step);
    });
    return null;
  } catch (error) {
    if (error instanceof StepRefusedError) return error.problem;
    if (error instanceof OnboardingLockedError || error instanceof ProjectNotInOnboardingError) return LOCKED_PROBLEM;
    const described = describeError(error);
    if (described !== null) return described;
    throw error;
  }
}

export function missingProblem(item: ChecklistItem): StepProblem {
  return {
    message: `Before you send this, we still need: ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}.`,
    field: null,
    fixHref: onboardingStepHref(item.step),
  };
}

/**
 * The submission itself, inside a transaction the caller opened as the customer (withTenantScope on the app
 * connection, or withCustomerRole on the staff one). It moves the project to `submitted` and starts the 48-hour
 * clock, then re-runs the checklist on data read inside the same transaction. The status change comes first, so it
 * waits for any save still in flight and every later save is refused; the checklist is then read from what is really
 * stored. Nothing posted by a form is used.
 *
 * Throws OnboardingLockedError when there is nothing open to send, and StepRefusedError (carrying the first missing
 * item) when the checklist fails: the caller must roll the transaction, or its savepoint, back on either.
 */
export async function sendOnboardingWithin(tx: ScopedTransaction, now: Date): Promise<Project> {
  const project = await findOpenProject(tx);
  if (project === null || isOnboardingLocked(project)) throw new OnboardingLockedError();
  const submitted = await submitProject(tx, { projectId: project.id, now });

  const missing = firstMissing(onboardingChecklist(checklistInputFrom(await readOnboardingSnapshot(tx))));
  if (missing !== null) throw new StepRefusedError(missingProblem(missing));
  return submitted;
}

/**
 * Sends onboarding for a customer who has already paid: the whole submission in one tenant-scoped transaction,
 * rolled back entirely if anything is missing. Payment is not checked here; the caller runs requireBillingAccess
 * first. (A first payment sends onboarding itself, in lib/server/payment-confirmation.ts.) Returns null when sent.
 */
export async function submitOnboardingFor(db: Database, tenant: TenantContext, now: Date): Promise<StepProblem | null> {
  try {
    await withTenantScope(db, tenant, (tx) => sendOnboardingWithin(tx, now));
  } catch (error) {
    if (error instanceof StepRefusedError) return error.problem;
    if (error instanceof OnboardingLockedError || error instanceof ProjectNotInOnboardingError) return LOCKED_PROBLEM;
    throw error;
  }
  // After the commit: a failed email must never undo or block what the customer has already sent.
  await notifyTeamOnboardingSent(tenant.businessId, tenant.businessName);
  return null;
}
