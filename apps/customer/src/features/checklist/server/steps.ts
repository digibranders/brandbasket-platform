import "server-only";
import {
  findOpenProject,
  markStepComplete,
  OnboardingLockedError,
  ProjectNotInOnboardingError,
  withTenantScope,
  type Database,
  type Project,
  type ScopedTransaction,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { isOnboardingLocked, ONBOARDING_LOCKED_MESSAGE } from "../rules-snapshot";
import type { AnswerStep } from "../rules-items";

/** Why a step was not saved, for the form to show. `field` is the exact form field name, when there is one. */
export interface StepProblem {
  readonly message: string;
  readonly field: string | null;
}

const LOCKED_PROBLEM: StepProblem = { message: ONBOARDING_LOCKED_MESSAGE, field: null };

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
 * Saves one item's answers and marks its step complete, all in one tenant-scoped transaction. `work` returns a problem to
 * refuse the save, and everything it wrote is rolled back. Once the project has left onboarding the database refuses every
 * save, and that surfaces here as the locked notice. Returns null when the item was saved.
 */
export async function saveItemStep(
  db: Database,
  tenant: TenantContext,
  step: AnswerStep,
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
