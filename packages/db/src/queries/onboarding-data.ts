import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { ScopedTransaction } from "../scope";
import {
  businessHours,
  businessProfiles,
  domains,
  onboardingProgress,
  projectBriefs,
  projects,
  services,
  type DomainStatus,
  type OnboardingStep,
} from "../schema";
import { currentBusinessId, hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

/*
 * Customer-side reads and saves for the onboarding steps. Every function takes the transaction opened by
 * withTenantScope on the app connection: row-level security limits it to the session's business, and writes take
 * the business id from that same scope (currentBusinessId), never from an argument.
 *
 * Every save first locks the tenant's project and checks it is still `onboarding`, in the caller's transaction,
 * and throws OnboardingLockedError otherwise. That is the server-side lock on submitted answers. The row lock is
 * FOR SHARE: saves do not block each other, but a submission waits for in-flight saves to commit, and a save that
 * starts after a submission sees the new status and is refused.
 */

export class OnboardingLockedError extends Error {
  constructor() {
    super("Onboarding has already been sent, so these answers can no longer be changed.");
    this.name = "OnboardingLockedError";
  }
}

export class ServiceNotFoundError extends Error {
  constructor(serviceId: string) {
    super(`Service ${serviceId} does not exist for this business, or has been removed.`);
    this.name = "ServiceNotFoundError";
  }
}

export class DuplicateServiceIdError extends Error {
  constructor(serviceId: string) {
    super(`Service ${serviceId} appears more than once in the list.`);
    this.name = "DuplicateServiceIdError";
  }
}

export class InvalidHostnameError extends Error {
  constructor() {
    super("A domain name is required.");
    this.name = "InvalidHostnameError";
  }
}

/** Deliberately does not say which business holds the hostname. */
export class DomainTakenError extends Error {
  constructor(hostname: string) {
    super(`The domain ${hostname} is already connected to another website.`);
    this.name = "DomainTakenError";
  }
}

export interface OnboardingLock {
  readonly businessId: string;
  readonly projectId: string;
}

type ProjectLockStrength = "share" | "update";

async function lockProjectRow(
  tx: ScopedTransaction,
  strength: ProjectLockStrength,
  projectId: string | undefined,
): Promise<OnboardingLock> {
  const businessId = await currentBusinessId(tx);
  if (projectId !== undefined && !isUuid(projectId)) throw new OnboardingLockedError();
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.businessId, businessId),
        eq(projects.status, "onboarding"),
        projectId === undefined ? undefined : eq(projects.id, projectId),
      ),
    )
    .limit(1)
    .for(strength);
  const project = rows[0];
  if (project === undefined) throw new OnboardingLockedError();
  return { businessId, projectId: project.id };
}

/**
 * Locks the tenant's onboarding project, or throws OnboardingLockedError. With `projectId`, that specific project
 * must be the one in onboarding. Every customer-side save calls this first, in its own transaction.
 */
export async function lockOnboardingProject(tx: ScopedTransaction, projectId?: string): Promise<OnboardingLock> {
  return lockProjectRow(tx, "share", projectId);
}

/**
 * Like lockOnboardingProject, but FOR UPDATE, so two transactions holding it run one after the other. Take it
 * before a read-then-write that must not interleave with another of its kind, such as counting photos before adding
 * one, or replacing the logo. It also waits for in-flight saves, and a submission waits for it.
 */
export async function lockOnboardingProjectExclusively(tx: ScopedTransaction): Promise<OnboardingLock> {
  return lockProjectRow(tx, "update", undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// Step 01: the business profile and opening hours
// ---------------------------------------------------------------------------------------------------------------

export interface BusinessProfileInput {
  readonly displayName: string;
  readonly tagline: string | null;
  readonly description: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly serviceAreas: string | null;
  readonly googleBusinessUrl: string | null;
}

export interface BusinessProfile extends BusinessProfileInput {
  readonly businessId: string;
  readonly updatedAt: Date;
}

const PROFILE_COLUMNS = {
  businessId: businessProfiles.businessId,
  displayName: businessProfiles.displayName,
  tagline: businessProfiles.tagline,
  description: businessProfiles.description,
  phone: businessProfiles.phone,
  email: businessProfiles.email,
  addressLine1: businessProfiles.addressLine1,
  addressLine2: businessProfiles.addressLine2,
  city: businessProfiles.city,
  region: businessProfiles.region,
  postalCode: businessProfiles.postalCode,
  country: businessProfiles.country,
  serviceAreas: businessProfiles.serviceAreas,
  googleBusinessUrl: businessProfiles.googleBusinessUrl,
  updatedAt: businessProfiles.updatedAt,
} as const;

export async function getBusinessProfile(tx: ScopedTransaction): Promise<BusinessProfile | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(PROFILE_COLUMNS)
    .from(businessProfiles)
    .where(eq(businessProfiles.businessId, businessId))
    .limit(1);
  return rows[0] ?? null;
}

/** Creates or replaces the whole profile. Every field is written, so a field sent as null is cleared. */
export async function saveBusinessProfile(
  tx: ScopedTransaction,
  input: BusinessProfileInput,
): Promise<BusinessProfile> {
  const { businessId } = await lockOnboardingProject(tx);
  const values = {
    displayName: input.displayName,
    tagline: input.tagline,
    description: input.description,
    phone: input.phone,
    email: input.email,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
    country: input.country,
    serviceAreas: input.serviceAreas,
    googleBusinessUrl: input.googleBusinessUrl,
  };
  const rows = await tx
    .insert(businessProfiles)
    .values({ businessId, ...values })
    .onConflictDoUpdate({ target: businessProfiles.businessId, set: { ...values, updatedAt: new Date() } })
    .returning(PROFILE_COLUMNS);
  const profile = rows[0];
  if (profile === undefined) throw new Error("Business profile upsert returned no row");
  return profile;
}

/**
 * One row of opening hours, shaped like the table. A row is closed (`closed`), open all day (`openAllDay`, no times)
 * or open between two different times; a closing time earlier than the opening time closes after midnight. The
 * business_hours_open_times_check constraint refuses any other combination.
 */
export interface BusinessHoursInput {
  /** 0-6, Monday = 0. */
  readonly dayOfWeek: number;
  /** `HH:MM` or `HH:MM:SS`. Null unless the day is open between two times. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly openAllDay: boolean;
}

export interface BusinessHoursRow {
  readonly id: string;
  readonly dayOfWeek: number;
  /** As Postgres returns a `time`: `HH:MM:SS`. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly openAllDay: boolean;
}

/** Shared with queries/business-facts.ts (replaceOpeningHours, readSiteFacts) so both read the same columns in
 * the same order rather than keeping two copies in sync by hand. */
export const HOURS_COLUMNS = {
  id: businessHours.id,
  dayOfWeek: businessHours.dayOfWeek,
  opensAt: businessHours.opensAt,
  closesAt: businessHours.closesAt,
  closed: businessHours.closed,
  openAllDay: businessHours.openAllDay,
} as const;

/** Ordered by day, then by opening time, so split shifts read in order. */
export async function getBusinessHours(tx: ScopedTransaction): Promise<BusinessHoursRow[]> {
  const businessId = await currentBusinessId(tx);
  return tx
    .select(HOURS_COLUMNS)
    .from(businessHours)
    .where(eq(businessHours.businessId, businessId))
    .orderBy(asc(businessHours.dayOfWeek), asc(businessHours.opensAt), asc(businessHours.id));
}

/**
 * Replaces the tenant's hours with `rows`: the old set is deleted and the new one inserted in the caller's
 * transaction, so a CHECK failure on any row leaves the old hours in place.
 */
export async function replaceBusinessHours(
  tx: ScopedTransaction,
  rows: readonly BusinessHoursInput[],
): Promise<BusinessHoursRow[]> {
  const { businessId } = await lockOnboardingProject(tx);
  await tx.delete(businessHours).where(eq(businessHours.businessId, businessId));
  if (rows.length > 0) {
    await tx.insert(businessHours).values(
      rows.map((row) => ({
        businessId,
        dayOfWeek: row.dayOfWeek,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        closed: row.closed,
        openAllDay: row.openAllDay,
      })),
    );
  }
  return getBusinessHours(tx);
}

// ---------------------------------------------------------------------------------------------------------------
// Step 02: services and the brief
// ---------------------------------------------------------------------------------------------------------------

export interface ServiceInput {
  /** The id of a service being kept; absent for a new one. */
  readonly id?: string;
  readonly name: string;
  readonly summary: string | null;
  readonly priceText: string | null;
}

export interface Service {
  readonly id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly priceText: string | null;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const SERVICE_COLUMNS = {
  id: services.id,
  name: services.name,
  summary: services.summary,
  priceText: services.priceText,
  position: services.position,
  createdAt: services.createdAt,
  updatedAt: services.updatedAt,
} as const;

/** The tenant's current services, in the customer's order. Removed services are not listed. */
export async function listServices(tx: ScopedTransaction): Promise<Service[]> {
  const businessId = await currentBusinessId(tx);
  return tx
    .select(SERVICE_COLUMNS)
    .from(services)
    .where(and(eq(services.businessId, businessId), isNull(services.deletedAt)))
    .orderBy(asc(services.position), asc(services.id));
}

/**
 * Makes the tenant's services exactly `items`, in that order: services left out are soft-deleted, services with an
 * id are updated, services without one are inserted, and every position is rewritten from the list index. An id
 * that is not one of the tenant's current services is refused, so a form cannot resurrect or reach another row.
 */
export async function replaceServices(tx: ScopedTransaction, items: readonly ServiceInput[]): Promise<Service[]> {
  const { businessId } = await lockOnboardingProject(tx);

  const seen = new Set<string>();
  for (const item of items) {
    if (item.id === undefined) continue;
    if (seen.has(item.id)) throw new DuplicateServiceIdError(item.id);
    seen.add(item.id);
  }

  const current = await tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.businessId, businessId), isNull(services.deletedAt)))
    .for("update");
  const currentIds = new Set(current.map((row) => row.id));
  for (const id of seen) {
    if (!currentIds.has(id)) throw new ServiceNotFoundError(id);
  }

  const now = new Date();
  const removed = [...currentIds].filter((id) => !seen.has(id));
  if (removed.length > 0) {
    await tx
      .update(services)
      .set({ deletedAt: now })
      .where(and(eq(services.businessId, businessId), inArray(services.id, removed)));
  }

  for (const [position, item] of items.entries()) {
    const fields = { name: item.name, summary: item.summary, priceText: item.priceText, position };
    if (item.id === undefined) {
      await tx.insert(services).values({ businessId, ...fields });
    } else {
      await tx
        .update(services)
        .set(fields)
        .where(and(eq(services.id, item.id), eq(services.businessId, businessId)));
    }
  }

  return listServices(tx);
}

export interface ProjectBriefInput {
  readonly notesForBuilder: string | null;
  readonly styleLikes: string | null;
  readonly referenceUrls: readonly string[];
}

export interface ProjectBrief extends ProjectBriefInput {
  readonly projectId: string;
  readonly updatedAt: Date;
}

const BRIEF_COLUMNS = {
  projectId: projectBriefs.projectId,
  notesForBuilder: projectBriefs.notesForBuilder,
  styleLikes: projectBriefs.styleLikes,
  referenceUrls: projectBriefs.referenceUrls,
  updatedAt: projectBriefs.updatedAt,
} as const;

export async function getProjectBrief(tx: ScopedTransaction, projectId: string): Promise<ProjectBrief | null> {
  if (!isUuid(projectId)) return null;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(BRIEF_COLUMNS)
    .from(projectBriefs)
    .where(and(eq(projectBriefs.projectId, projectId), eq(projectBriefs.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Creates or replaces the brief for `projectId`, which must be the tenant's project still in onboarding. */
export async function saveProjectBrief(
  tx: ScopedTransaction,
  projectId: string,
  input: ProjectBriefInput,
): Promise<ProjectBrief> {
  const lock = await lockOnboardingProject(tx, projectId);
  const values = {
    notesForBuilder: input.notesForBuilder,
    styleLikes: input.styleLikes,
    referenceUrls: [...input.referenceUrls],
  };
  const rows = await tx
    .insert(projectBriefs)
    .values({ projectId: lock.projectId, businessId: lock.businessId, ...values })
    .onConflictDoUpdate({ target: projectBriefs.projectId, set: { ...values, updatedAt: new Date() } })
    .returning(BRIEF_COLUMNS);
  const brief = rows[0];
  if (brief === undefined) throw new Error("Project brief upsert returned no row");
  return brief;
}

// ---------------------------------------------------------------------------------------------------------------
// Step 04: the domain
// ---------------------------------------------------------------------------------------------------------------

export interface PrimaryDomainInput {
  /** Trimmed and lowercased here. Full hostname validation belongs to the form that collects it. */
  readonly hostname: string;
  /** When the customer confirmed they own the domain, or null if they have not. */
  readonly ownerConfirmedAt: Date | null;
}

export interface PrimaryDomain {
  readonly id: string;
  readonly hostname: string;
  readonly status: DomainStatus;
  readonly ownerConfirmedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const DOMAIN_COLUMNS = {
  id: domains.id,
  hostname: domains.hostname,
  status: domains.status,
  ownerConfirmedAt: domains.ownerConfirmedAt,
  createdAt: domains.createdAt,
  updatedAt: domains.updatedAt,
} as const;

function primaryDomainOf(businessId: string): SQL | undefined {
  return and(eq(domains.businessId, businessId), eq(domains.isPrimary, true), isNull(domains.removedAt));
}

export async function getPrimaryDomain(tx: ScopedTransaction): Promise<PrimaryDomain | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx.select(DOMAIN_COLUMNS).from(domains).where(primaryDomainOf(businessId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Stores the tenant's one primary hostname. The same hostname again only updates the ownership confirmation; a
 * different one retires the old row (kept, with `removed_at`) and inserts a new one. A hostname live for another
 * business throws DomainTakenError, and the tenant's previous domain is left as it was.
 */
export async function savePrimaryDomain(tx: ScopedTransaction, input: PrimaryDomainInput): Promise<PrimaryDomain> {
  const { businessId } = await lockOnboardingProject(tx);
  const hostname = input.hostname.trim().toLowerCase();
  if (hostname === "") throw new InvalidHostnameError();

  const existing = await tx
    .select({ id: domains.id, hostname: domains.hostname })
    .from(domains)
    .where(primaryDomainOf(businessId))
    .limit(1)
    .for("update");
  const current = existing[0];

  if (current !== undefined && current.hostname === hostname) {
    const rows = await tx
      .update(domains)
      .set({ ownerConfirmedAt: input.ownerConfirmedAt })
      .where(eq(domains.id, current.id))
      .returning(DOMAIN_COLUMNS);
    const updated = rows[0];
    if (updated === undefined) throw new Error("Domain update returned no row");
    return updated;
  }

  try {
    // A savepoint, so a hostname conflict rolls back only this attempt and the caller gets a typed error with its
    // transaction still usable.
    return await tx.transaction(async (savepoint) => {
      if (current !== undefined) {
        await savepoint.update(domains).set({ removedAt: new Date() }).where(eq(domains.id, current.id));
      }
      const rows = await savepoint
        .insert(domains)
        .values({ businessId, hostname, isPrimary: true, status: "pending", ownerConfirmedAt: input.ownerConfirmedAt })
        .returning(DOMAIN_COLUMNS);
      const inserted = rows[0];
      if (inserted === undefined) throw new Error("Domain insert returned no row");
      return inserted;
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new DomainTakenError(hostname);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------------------------

export interface StepProgress {
  readonly step: OnboardingStep;
  readonly completedAt: Date | null;
}

/** Marks `step` complete on `projectId`, which must be the tenant's project still in onboarding. */
export async function markStepComplete(
  tx: ScopedTransaction,
  projectId: string,
  step: OnboardingStep,
): Promise<StepProgress> {
  const lock = await lockOnboardingProject(tx, projectId);
  const now = new Date();
  const rows = await tx
    .insert(onboardingProgress)
    .values({ projectId: lock.projectId, businessId: lock.businessId, step, completedAt: now })
    .onConflictDoUpdate({
      target: [onboardingProgress.projectId, onboardingProgress.step],
      set: { completedAt: now, updatedAt: now },
    })
    .returning({ step: onboardingProgress.step, completedAt: onboardingProgress.completedAt });
  const progress = rows[0];
  if (progress === undefined) throw new Error("Onboarding progress upsert returned no row");
  return progress;
}

/** The steps recorded for `projectId`, in step order. Steps never touched are absent. */
export async function listStepProgress(tx: ScopedTransaction, projectId: string): Promise<StepProgress[]> {
  if (!isUuid(projectId)) return [];
  const businessId = await currentBusinessId(tx);
  return tx
    .select({ step: onboardingProgress.step, completedAt: onboardingProgress.completedAt })
    .from(onboardingProgress)
    .where(and(eq(onboardingProgress.projectId, projectId), eq(onboardingProgress.businessId, businessId)))
    .orderBy(asc(onboardingProgress.step));
}
