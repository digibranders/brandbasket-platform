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
  type BusinessProfile,
  type Database,
  type MediaAsset,
  type PrimaryDomain,
  type Project,
  type ScopedTransaction,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import { readLiveWebsite, saveOnboardingStep, submitOnboardingFor } from "./onboarding";
import { notifyTeamOnboardingSent } from "./onboarding-alert";

// The database is a test double: the lock, row-level security and the one-way status change are proven in
// packages/db's integration tests. What is checked here is what each outcome turns into, and that a refused
// submission is rolled back rather than committed.
vi.mock("server-only", () => ({}));
vi.mock("./customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./onboarding-alert", () => ({ notifyTeamOnboardingSent: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class MockOnboardingLockedError extends Error {}
  class MockProjectNotInOnboardingError extends Error {}
  return {
    findLatestProject: vi.fn(),
    findOpenProject: vi.fn(),
    getBusinessHours: vi.fn(),
    getBusinessProfile: vi.fn(),
    getPrimaryDomain: vi.fn(),
    getProjectBrief: vi.fn(),
    listMediaAssets: vi.fn(),
    listServices: vi.fn(),
    listStepProgress: vi.fn(),
    markStepComplete: vi.fn(),
    OnboardingLockedError: MockOnboardingLockedError,
    ProjectNotInOnboardingError: MockProjectNotInOnboardingError,
    submitProject: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const NOW = new Date("2026-09-16T10:00:00Z");
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const db = { name: "app-db" } as unknown as Database;
const tx = { name: "scoped-tx" } as unknown as ScopedTransaction;
const tenant: TenantContext = { userId: "user-a", businessId: BUSINESS_ID, businessName: "Bloom", role: "owner" };

const PROJECT: Project = {
  id: "0192f3c4-5555-7000-8000-000000000005",
  businessId: BUSINESS_ID,
  kind: "initial_build",
  status: "onboarding",
  onboardingSubmittedAt: null,
  slaDueAt: null,
  previewUrl: null,
  previewSentAt: null,
  onHoldReason: null,
  revisionRoundsIncluded: 2,
  revisionRoundsGranted: 0,
  launchedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const PROFILE = { displayName: "Bloom Dental", phone: "+91 98765 43210", email: null } as BusinessProfile;
const DOMAIN = { hostname: "bloom.in", ownerConfirmedAt: NOW } as PrimaryDomain;
const LOGO = { id: "logo", purpose: "logo", altText: null } as MediaAsset;

let outcome: "committed" | "rolled back" | null;

beforeEach(() => {
  vi.resetAllMocks();
  outcome = null;
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => {
    try {
      const result = await work(tx);
      outcome = "committed";
      return result;
    } catch (error) {
      outcome = "rolled back";
      throw error;
    }
  });
  vi.mocked(findOpenProject).mockResolvedValue(PROJECT);
  vi.mocked(listStepProgress).mockResolvedValue([]);
  vi.mocked(getBusinessProfile).mockResolvedValue(PROFILE);
  vi.mocked(getBusinessHours).mockResolvedValue([]);
  vi.mocked(listServices).mockResolvedValue([
    { id: "s1", name: "Check-up", summary: null, priceText: null, position: 0, createdAt: NOW, updatedAt: NOW },
  ]);
  vi.mocked(getProjectBrief).mockResolvedValue(null);
  vi.mocked(getPrimaryDomain).mockResolvedValue(DOMAIN);
  vi.mocked(listMediaAssets).mockImplementation(async (_tx, purpose) => (purpose === "logo" ? [LOGO] : []));
});

describe("saveOnboardingStep", () => {
  it("runs the work and marks the step complete in one tenant-scoped transaction", async () => {
    const work = vi.fn(async () => null);

    await expect(saveOnboardingStep(db, tenant, "business", work)).resolves.toBeNull();
    expect(withTenantScope).toHaveBeenCalledWith(db, tenant, expect.any(Function));
    expect(work).toHaveBeenCalledWith(tx, PROJECT);
    expect(markStepComplete).toHaveBeenCalledWith(tx, PROJECT.id, "business");
    expect(outcome).toBe("committed");
  });

  it("rolls back and reports the problem when the work refuses", async () => {
    const problem = { message: "Describe this photo.", field: "photos.x.alt" };

    await expect(saveOnboardingStep(db, tenant, "brand", async () => problem)).resolves.toEqual(problem);
    expect(markStepComplete).not.toHaveBeenCalled();
    expect(outcome).toBe("rolled back");
  });

  it.each([
    ["the project has been sent", { ...PROJECT, status: "submitted" as const }],
    ["there is no open project", null],
  ])("shows the locked notice without saving when %s", async (_label, project) => {
    vi.mocked(findOpenProject).mockResolvedValue(project);
    const work = vi.fn(async () => null);

    await expect(saveOnboardingStep(db, tenant, "content", work)).resolves.toEqual({
      message: ONBOARDING_LOCKED_MESSAGE,
      field: null,
    });
    expect(work).not.toHaveBeenCalled();
  });

  it("shows the locked notice when the database refuses a save that raced a submission", async () => {
    const work = vi.fn(async () => {
      throw new OnboardingLockedError();
    });

    await expect(saveOnboardingStep(db, tenant, "domain", work)).resolves.toMatchObject({
      message: ONBOARDING_LOCKED_MESSAGE,
    });
  });

  it("lets the step describe the errors it expects, and rethrows the rest", async () => {
    const expected = new Error("taken");
    const describe = (error: unknown) => (error === expected ? { message: "Already connected.", field: "domain" } : null);

    await expect(
      saveOnboardingStep(db, tenant, "domain", async () => Promise.reject(expected), describe),
    ).resolves.toEqual({ message: "Already connected.", field: "domain" });
    await expect(
      saveOnboardingStep(db, tenant, "domain", async () => Promise.reject(new Error("boom")), describe),
    ).rejects.toThrow("boom");
  });
});

describe("submitOnboardingFor", () => {
  it("sends a complete onboarding and keeps the status change", async () => {
    await expect(submitOnboardingFor(db, tenant, NOW)).resolves.toBeNull();
    expect(submitProject).toHaveBeenCalledWith(tx, { projectId: PROJECT.id, now: NOW });
    expect(outcome).toBe("committed");
  });

  it("tells the team once it has been sent, and not when it is refused", async () => {
    await submitOnboardingFor(db, tenant, NOW);
    expect(notifyTeamOnboardingSent).toHaveBeenCalledWith(BUSINESS_ID, "Bloom");

    vi.mocked(notifyTeamOnboardingSent).mockClear();
    vi.mocked(getPrimaryDomain).mockResolvedValue(null);
    await submitOnboardingFor(db, tenant, NOW);
    expect(notifyTeamOnboardingSent).not.toHaveBeenCalled();
  });

  it("changes the status before reading the checklist, so in-flight saves are waited for", async () => {
    const order: string[] = [];
    vi.mocked(submitProject).mockImplementation(async () => {
      order.push("submit");
      return { ...PROJECT, status: "submitted" };
    });
    vi.mocked(getPrimaryDomain).mockImplementation(async () => {
      order.push("read domain");
      return DOMAIN;
    });

    await submitOnboardingFor(db, tenant, NOW);
    expect(order).toEqual(["submit", "read domain"]);
  });

  it("rolls the submission back and links to the step when something is missing", async () => {
    vi.mocked(getPrimaryDomain).mockResolvedValue(null);

    await expect(submitOnboardingFor(db, tenant, NOW)).resolves.toEqual({
      message: "Before you send this, we still need: your domain, confirmed as yours.",
      field: null,
      fixHref: "/onboarding/domain",
    });
    expect(outcome).toBe("rolled back");
  });

  it("refuses when a photo has no description", async () => {
    vi.mocked(listMediaAssets).mockImplementation(async (_tx, purpose) =>
      purpose === "photo" ? [{ id: "p1", purpose: "photo", altText: null } as MediaAsset] : [],
    );

    await expect(submitOnboardingFor(db, tenant, NOW)).resolves.toMatchObject({ fixHref: "/onboarding/brand" });
    expect(outcome).toBe("rolled back");
  });

  it("shows the locked notice when it was already sent", async () => {
    vi.mocked(findOpenProject).mockResolvedValue({ ...PROJECT, status: "building" });

    await expect(submitOnboardingFor(db, tenant, NOW)).resolves.toEqual({ message: ONBOARDING_LOCKED_MESSAGE, field: null });
    expect(submitProject).not.toHaveBeenCalled();
  });

  it("shows the locked notice when a second submission loses the race", async () => {
    vi.mocked(submitProject).mockRejectedValue(new ProjectNotInOnboardingError(PROJECT.id));

    await expect(submitOnboardingFor(db, tenant, NOW)).resolves.toMatchObject({ message: ONBOARDING_LOCKED_MESSAGE });
  });
});

describe("readLiveWebsite", () => {
  const LAUNCHED = new Date("2026-09-20T08:00:00Z");
  const LIVE_PROJECT: Project = { ...PROJECT, status: "live", launchedAt: LAUNCHED };

  it("hands over the address and the launch date once the site is live", async () => {
    vi.mocked(findLatestProject).mockResolvedValue(LIVE_PROJECT);

    await expect(readLiveWebsite(tx)).resolves.toEqual({ hostname: "bloom.in", launchedAt: LAUNCHED });
  });

  // Every status but `live` means the site is not the customer's to edit yet, so none of them hand anything over.
  it.each(["onboarding", "submitted", "building", "preview", "revisions", "approved", "on_hold", "cancelled"] as const)(
    "hands over nothing while %s",
    async (status) => {
      vi.mocked(findLatestProject).mockResolvedValue({ ...PROJECT, status });

      await expect(readLiveWebsite(tx)).resolves.toBeNull();
      expect(getPrimaryDomain).not.toHaveBeenCalled();
    },
  );

  it("hands over nothing when onboarding never started", async () => {
    vi.mocked(findLatestProject).mockResolvedValue(null);

    await expect(readLiveWebsite(tx)).resolves.toBeNull();
  });

  // Can't happen through the admin's Mark live action, which refuses a business with no primary domain. Checked
  // anyway because there is no address to hand over without one, and a live card with a blank link is worse than none.
  it("hands over nothing when the live project has lost its primary domain", async () => {
    vi.mocked(findLatestProject).mockResolvedValue(LIVE_PROJECT);
    vi.mocked(getPrimaryDomain).mockResolvedValue(null);

    await expect(readLiveWebsite(tx)).resolves.toBeNull();
  });
});
