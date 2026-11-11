import { findOpenProject, markStepComplete, OnboardingLockedError, ProjectNotInOnboardingError, withTenantScope, type Database, type Project, type ScopedTransaction } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_LOCKED_MESSAGE } from "../rules-snapshot";
import { saveItemStep } from "./steps";

vi.mock("@brandbasket/db", () => {
  class MockOnboardingLockedError extends Error {}
  class MockProjectNotInOnboardingError extends Error {}
  return {
    findOpenProject: vi.fn(),
    markStepComplete: vi.fn(),
    OnboardingLockedError: MockOnboardingLockedError,
    ProjectNotInOnboardingError: MockProjectNotInOnboardingError,
    withTenantScope: vi.fn(),
  };
});

const db = { name: "app-db" } as unknown as Database;
const tx = { name: "scoped-tx" } as unknown as ScopedTransaction;
const tenant: TenantContext = { userId: "u1", businessId: "b1", businessName: "Bloom", role: "owner" };
const PROJECT = { id: "p1", status: "onboarding" } as Project;

beforeEach(() => {
  vi.clearAllMocks();
  // A rollback is a rejected transaction callback; the double passes the rejection on.
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(findOpenProject).mockResolvedValue(PROJECT);
});

describe("saveItemStep", () => {
  it("does the work, then marks the step, and reports nothing", async () => {
    const work = vi.fn().mockResolvedValue(null);
    expect(await saveItemStep(db, tenant, "brand", work)).toBeNull();
    expect(work).toHaveBeenCalledWith(tx, PROJECT);
    expect(markStepComplete).toHaveBeenCalledWith(tx, "p1", "brand");
  });

  it("refuses the save, and never marks the step, when the work returns a problem", async () => {
    const problem = { message: "Add a logo.", field: "logo" };
    expect(await saveItemStep(db, tenant, "brand", async () => problem)).toEqual(problem);
    expect(markStepComplete).not.toHaveBeenCalled();
  });

  it("reads a project that has left onboarding as locked, without running the work", async () => {
    vi.mocked(findOpenProject).mockResolvedValue({ ...PROJECT, status: "submitted" });
    const work = vi.fn();
    expect(await saveItemStep(db, tenant, "business", work)).toEqual({ message: ONBOARDING_LOCKED_MESSAGE, field: null });
    expect(work).not.toHaveBeenCalled();
  });

  it("reads no project as locked", async () => {
    vi.mocked(findOpenProject).mockResolvedValue(null);
    expect(await saveItemStep(db, tenant, "business", async () => null)).toMatchObject({ message: ONBOARDING_LOCKED_MESSAGE });
  });

  it("turns the database's own lock refusals into the locked notice", async () => {
    expect(await saveItemStep(db, tenant, "business", async () => Promise.reject(new OnboardingLockedError()))).toMatchObject({ message: ONBOARDING_LOCKED_MESSAGE });
    expect(await saveItemStep(db, tenant, "business", async () => Promise.reject(new ProjectNotInOnboardingError("p1")))).toMatchObject({ message: ONBOARDING_LOCKED_MESSAGE });
  });

  it("shows an error the caller expects, and lets anything else propagate", async () => {
    const boom = new Error("boom");
    expect(await saveItemStep(db, tenant, "domain", async () => Promise.reject(boom), (error) => (error === boom ? { message: "Taken.", field: "domain" } : null))).toEqual({ message: "Taken.", field: "domain" });
    await expect(saveItemStep(db, tenant, "domain", async () => Promise.reject(boom))).rejects.toBe(boom);
  });
});
