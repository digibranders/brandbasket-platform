import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import {
  businesses,
  businessHours,
  businessMembers,
  businessProfiles,
  domains,
  mediaAssets,
  onboardingProgress,
  payments,
  plans,
  projectBriefs,
  projects,
  services,
  subscriptions,
  UNAPPLIED_PAYMENT_REASONS,
  users,
  type BillingCurrency,
  type BillingProviderName,
  type MediaAssetPurpose,
  type OnboardingStep,
  type PlanTier,
  type ProjectStatus,
  type SubscriptionStatus,
} from "../schema";
import { isPhoneAccountEmail } from "../phone-account";
import { PLAN_EXCLUDED_PAYMENT_KINDS, planTierForSignupChoice } from "./billing";
import { isUuid } from "./tenant";

/**
 * Staff-side reads of a customer's business and everything they have told us. Use with the staff connection only:
 * these read across tenants by design, which is exactly what the customer connection must never do.
 */

export interface ClientOwner {
  readonly name: string;
  /**
   * Where the owner can be written to, or null for an account opened with a mobile number: a Premium member who
   * signed up on the entry page. Its stored address is a placeholder nobody reads (isPhoneAccountEmail), so it is
   * never handed to anything that shows or emails it.
   */
  readonly email: string | null;
  /** The number the owner signs in with, E.164, or null for an account that signs in with an email. */
  readonly phone: string | null;
}

export interface ClientProject {
  readonly id: string;
  readonly status: ProjectStatus;
  readonly onboardingSubmittedAt: Date | null;
  readonly slaDueAt: Date | null;
  readonly previewUrl: string | null;
  readonly previewSentAt: Date | null;
  readonly revisionRoundsGranted: number;
  readonly launchedAt: Date | null;
  readonly createdAt: Date;
}

export interface ClientSubscription {
  readonly status: SubscriptionStatus;
  readonly provider: BillingProviderName;
  readonly activatedAt: Date | null;
  readonly paidThroughAt: Date | null;
  readonly commitmentEndsAt: Date | null;
}

/** The audit trail of a payment recorded by hand. */
export interface ClientManualPayment {
  /** The staff member who recorded it; null only for payments recorded before the trail existed. */
  readonly recordedBy: { readonly id: string; readonly name: string } | null;
  readonly reference: string | null;
  /** The calendar date the money arrived, `YYYY-MM-DD`. */
  readonly receivedOn: string | null;
}

export interface ClientFirstPayment {
  /** Integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly provider: BillingProviderName;
  readonly paidAt: Date | null;
  /** Set when `provider` is `manual`. */
  readonly manual: ClientManualPayment | null;
}

export interface ClientBilling {
  /**
   * The newest subscription, whatever its status: one cancelled inside its paid period still grants access. Whether
   * it does is decided by @firstfold/billing.
   */
  readonly subscription: ClientSubscription | null;
  /** The first payment that bought something. A payment that could not be applied is not one. */
  readonly firstPayment: ClientFirstPayment | null;
}

export interface ClientSummary {
  readonly businessId: string;
  readonly businessName: string;
  readonly currency: BillingCurrency;
  /** The plan the client is on: Care (the website only) or Premium. Decides which of its features staff may switch on. */
  readonly tier: PlanTier;
  readonly createdAt: Date;
  readonly owner: ClientOwner | null;
  /** The most recent project; a business has at most one open one. */
  readonly project: ClientProject | null;
  readonly billing: ClientBilling;
}

const PROJECT_COLUMNS = {
  id: projects.id,
  businessId: projects.businessId,
  status: projects.status,
  onboardingSubmittedAt: projects.onboardingSubmittedAt,
  slaDueAt: projects.slaDueAt,
  previewUrl: projects.previewUrl,
  previewSentAt: projects.previewSentAt,
  revisionRoundsGranted: projects.revisionRoundsGranted,
  launchedAt: projects.launchedAt,
  createdAt: projects.createdAt,
} as const;

async function ownersByBusiness(db: Database, businessIds: readonly string[]): Promise<Map<string, ClientOwner>> {
  if (businessIds.length === 0) return new Map();
  const rows = await db
    .select({ businessId: businessMembers.businessId, name: users.name, email: users.email, phone: users.phoneNumber })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(inArray(businessMembers.businessId, [...businessIds]), eq(businessMembers.role, "owner")))
    // The earliest owner is the one who redeemed the setup link.
    .orderBy(asc(businessMembers.createdAt), asc(businessMembers.userId));
  const owners = new Map<string, ClientOwner>();
  for (const row of rows) {
    if (owners.has(row.businessId)) continue;
    owners.set(row.businessId, { name: row.name, email: isPhoneAccountEmail(row.email) ? null : row.email, phone: row.phone });
  }
  return owners;
}

async function latestProjectByBusiness(
  db: Database,
  businessIds: readonly string[],
): Promise<Map<string, ClientProject>> {
  if (businessIds.length === 0) return new Map();
  const rows = await db
    .select(PROJECT_COLUMNS)
    .from(projects)
    .where(inArray(projects.businessId, [...businessIds]))
    .orderBy(desc(projects.createdAt), desc(projects.id));
  const latest = new Map<string, ClientProject>();
  for (const { businessId, ...project } of rows) {
    if (!latest.has(businessId)) latest.set(businessId, project);
  }
  return latest;
}

async function billingByBusiness(db: Database, businessIds: readonly string[]): Promise<Map<string, ClientBilling>> {
  if (businessIds.length === 0) return new Map();
  const ids = [...businessIds];
  const [subscriptionRows, paymentRows] = await Promise.all([
    db
      .select({
        businessId: subscriptions.businessId,
        status: subscriptions.status,
        provider: subscriptions.provider,
        activatedAt: subscriptions.activatedAt,
        paidThroughAt: subscriptions.paidThroughAt,
        commitmentEndsAt: subscriptions.commitmentEndsAt,
      })
      .from(subscriptions)
      .where(inArray(subscriptions.businessId, ids))
      // Newest first, so the first row seen per business is its latest (see findLatestSubscriptionForBusiness).
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)),
    db
      .select({
        businessId: payments.businessId,
        amountCents: payments.amountCents,
        currency: payments.currency,
        provider: payments.provider,
        paidAt: payments.paidAt,
        recordedById: payments.recordedByStaffId,
        recordedByName: users.name,
        reference: payments.manualReference,
        receivedOn: payments.receivedOn,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedByStaffId))
      .where(
        and(
          inArray(payments.businessId, ids),
          eq(payments.status, "captured"),
          // A paid extra or an add-on says nothing about the plan, so neither is its first payment.
          notInArray(payments.kind, [...PLAN_EXCLUDED_PAYMENT_KINDS]),
          or(isNull(payments.attentionReason), notInArray(payments.attentionReason, [...UNAPPLIED_PAYMENT_REASONS])),
        ),
      )
      .orderBy(asc(payments.paidAt), asc(payments.id)),
  ]);

  const billing = new Map<string, ClientBilling>();
  for (const id of ids) billing.set(id, { subscription: null, firstPayment: null });
  for (const { businessId, ...subscription } of subscriptionRows) {
    const current = billing.get(businessId);
    if (current !== undefined && current.subscription === null) billing.set(businessId, { ...current, subscription });
  }
  for (const { businessId, recordedById, recordedByName, reference, receivedOn, ...payment } of paymentRows) {
    const current = billing.get(businessId);
    if (current === undefined || current.firstPayment !== null) continue;
    const manual: ClientManualPayment | null =
      payment.provider === "manual"
        ? {
            recordedBy: recordedById === null || recordedByName === null ? null : { id: recordedById, name: recordedByName },
            reference,
            receivedOn,
          }
        : null;
    billing.set(businessId, { ...current, firstPayment: { ...payment, manual } });
  }
  return billing;
}

/**
 * Each business's plan: its newest subscription's plan's tier, and for one that has never subscribed (a lead not yet
 * paid, an account from a setup link) what it chose at sign-up, which is Premium unless it chose Care.
 */
const pendingPlans = alias(plans, "pending_plans");

async function tiersByBusiness(db: Database, businessIds: readonly string[]): Promise<Map<string, PlanTier>> {
  if (businessIds.length === 0) return new Map();
  const ids = [...businessIds];
  const [subscribed, chosen] = await Promise.all([
    // A move up that has been paid for counts at once: the client has Premium though the provider still bills Care.
    db
      .select({ businessId: subscriptions.businessId, tier: sql<PlanTier>`coalesce(${pendingPlans.tier}, ${plans.tier})` })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(pendingPlans, eq(pendingPlans.id, subscriptions.pendingPlanId))
      .where(inArray(subscriptions.businessId, ids))
      // Newest first, so the first row seen per business is its latest (see findLatestSubscriptionForBusiness).
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)),
    db.select({ id: businesses.id, signupChoice: businesses.signupChoice }).from(businesses).where(inArray(businesses.id, ids)),
  ]);
  const tiers = new Map<string, PlanTier>();
  for (const row of subscribed) if (!tiers.has(row.businessId)) tiers.set(row.businessId, row.tier);
  for (const row of chosen) if (!tiers.has(row.id)) tiers.set(row.id, planTierForSignupChoice(row.signupChoice));
  return tiers;
}

const NO_BILLING: ClientBilling = { subscription: null, firstPayment: null };

/**
 * Every website client with its owner and current project, newest first. Free listing accounts (kind `listing`) are
 * not clients: the staff console shows them on the Ads page.
 */
export async function listClients(db: Database): Promise<ClientSummary[]> {
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      currency: businesses.currency,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(eq(businesses.kind, "website"))
    .orderBy(desc(businesses.createdAt), desc(businesses.id));

  const ids = rows.map((row) => row.businessId);
  const [owners, projectsByBusiness, billing, tiers] = await Promise.all([
    ownersByBusiness(db, ids),
    latestProjectByBusiness(db, ids),
    billingByBusiness(db, ids),
    tiersByBusiness(db, ids),
  ]);

  return rows.map((row) => ({
    ...row,
    tier: tiers.get(row.businessId) ?? "premium",
    owner: owners.get(row.businessId) ?? null,
    project: projectsByBusiness.get(row.businessId) ?? null,
    billing: billing.get(row.businessId) ?? NO_BILLING,
  }));
}

export interface ClientHours {
  readonly dayOfWeek: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly openAllDay: boolean;
}

export interface ClientService {
  readonly id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly priceText: string | null;
}

export interface ClientMedia {
  readonly id: string;
  readonly purpose: MediaAssetPurpose;
  readonly altText: string | null;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Date;
}

export interface ClientDetail extends ClientSummary {
  readonly profile: typeof businessProfiles.$inferSelect | null;
  readonly hours: readonly ClientHours[];
  readonly services: readonly ClientService[];
  readonly brief: {
    readonly notesForBuilder: string | null;
    readonly styleLikes: string | null;
    readonly referenceUrls: readonly string[];
  } | null;
  readonly domain: { readonly hostname: string; readonly ownerConfirmedAt: Date | null } | null;
  readonly media: readonly ClientMedia[];
  readonly completedSteps: readonly OnboardingStep[];
}

/** Everything a builder needs from one business, or null when there is no such business. */
export async function findClientDetail(db: Database, businessId: string): Promise<ClientDetail | null> {
  // The id comes from the URL; anything that isn't a UUID is simply not a business.
  if (!isUuid(businessId)) return null;
  const businessRows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      currency: businesses.currency,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const business = businessRows[0];
  if (business === undefined) return null;

  const [owners, projectsByBusiness, billing, tiers, profileRows, hours, serviceRows, domainRows, media] = await Promise.all([
    ownersByBusiness(db, [businessId]),
    latestProjectByBusiness(db, [businessId]),
    billingByBusiness(db, [businessId]),
    tiersByBusiness(db, [businessId]),
    db.select().from(businessProfiles).where(eq(businessProfiles.businessId, businessId)).limit(1),
    db
      .select({
        dayOfWeek: businessHours.dayOfWeek,
        opensAt: businessHours.opensAt,
        closesAt: businessHours.closesAt,
        closed: businessHours.closed,
        openAllDay: businessHours.openAllDay,
      })
      .from(businessHours)
      .where(eq(businessHours.businessId, businessId))
      .orderBy(asc(businessHours.dayOfWeek), asc(businessHours.opensAt)),
    db
      .select({ id: services.id, name: services.name, summary: services.summary, priceText: services.priceText })
      .from(services)
      .where(and(eq(services.businessId, businessId), isNull(services.deletedAt)))
      .orderBy(asc(services.position)),
    db
      .select({ hostname: domains.hostname, ownerConfirmedAt: domains.ownerConfirmedAt })
      .from(domains)
      .where(and(eq(domains.businessId, businessId), eq(domains.isPrimary, true), isNull(domains.removedAt)))
      .limit(1),
    db
      .select({
        id: mediaAssets.id,
        purpose: mediaAssets.purpose,
        altText: mediaAssets.altText,
        width: mediaAssets.width,
        height: mediaAssets.height,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.businessId, businessId), eq(mediaAssets.status, "ready"), isNull(mediaAssets.deletedAt)),
      )
      .orderBy(asc(mediaAssets.createdAt), asc(mediaAssets.id)),
  ]);

  const project = projectsByBusiness.get(businessId) ?? null;
  const [briefRows, progressRows] =
    project === null
      ? [[], []]
      : await Promise.all([
          db
            .select({
              notesForBuilder: projectBriefs.notesForBuilder,
              styleLikes: projectBriefs.styleLikes,
              referenceUrls: projectBriefs.referenceUrls,
            })
            .from(projectBriefs)
            .where(eq(projectBriefs.projectId, project.id))
            .limit(1),
          db
            .select({ step: onboardingProgress.step })
            .from(onboardingProgress)
            .where(and(eq(onboardingProgress.projectId, project.id), eq(onboardingProgress.businessId, businessId))),
        ]);

  return {
    ...business,
    tier: tiers.get(businessId) ?? "premium",
    owner: owners.get(businessId) ?? null,
    project,
    billing: billing.get(businessId) ?? NO_BILLING,
    profile: profileRows[0] ?? null,
    hours,
    services: serviceRows,
    brief: briefRows[0] ?? null,
    domain: domainRows[0] ?? null,
    media,
    completedSteps: progressRows.map((row) => row.step),
  };
}

export interface StaffMediaFile {
  readonly storageKey: string;
  readonly mimeType: string;
  /** Hex SHA-256 of the stored file, for the response's ETag. */
  readonly sha256: string;
}

/** A stored image for the staff console to display, whichever business it belongs to. */
export async function findMediaForStaff(db: Database, mediaId: string): Promise<StaffMediaFile | null> {
  if (!isUuid(mediaId)) return null;
  const rows = await db
    .select({ storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType, sha256: mediaAssets.sha256 })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.status, "ready"), isNull(mediaAssets.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}
