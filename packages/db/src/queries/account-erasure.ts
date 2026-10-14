import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { listBusinessProductPhotoIds } from "./directory-business-catalog";
import { eraseSupportDataForUser } from "./support";
import type { ScopedTransaction } from "../scope";
import {
  accountClosures,
  accountOtps,
  accounts,
  addOnSubscriptions,
  appointmentServices,
  appointmentSettings,
  appointments,
  billingProfiles,
  bookingOtps,
  businessAnnouncements,
  businessClosures,
  businessHours,
  businessMembers,
  businessModules,
  businessProfiles,
  businesses,
  directoryBusinessCategories,
  directoryBusinessFaqs,
  directoryBusinessProducts,
  directoryBusinessProfiles,
  directoryBusinessServices,
  directoryClaims,
  directoryDeals,
  directoryListings,
  directoryPictures,
  directoryVideos,
  domains,
  emailMessages,
  leads,
  listingContent,
  mediaAssets,
  onboardingProgress,
  patients,
  practitionerHours,
  practitionerLeave,
  practitioners,
  projectBriefs,
  projects,
  services,
  sessions,
  setupInvites,
  smsMessages,
  staffMembers,
  subscriptions,
  userPrivacySettings,
  users,
  verifications,
} from "../schema";

/*
 * The last step of deleting an account: what happens once its grace period (account_closures.erase_after) is over.
 *
 * What is erased is what a person gave us or made here: their sign-in, their business's details, content, pictures,
 * patients and bookings, directory listing and the sales lead that brought them. What is kept is the financial
 * record (subscriptions, payments, charges, plan upgrades, tax invoices, affiliate earnings, ad bids and wins): books must stay
 * whole, and none of it names a person once the business row is anonymised below, except a tax invoice, which keeps the
 * name and address it was issued to because the law requires that record for 8 years. The user row is anonymised rather than deleted for
 * the same reason: staff-facing records still point at it. Add-ons (their subscriptions, payment links and press
 * releases) are kept like payments, as the record of what was sold.
 *
 * Runs on the staff connection only. The caller (apps/platform/lib/server/account-erasure.ts) removes the files and
 * the website content kept outside this database around it.
 */

/** Why a closure that was asked to be erased was left alone, for the report the caller prints. */
export type ErasureSkipReason =
  /** The closure was restored, erased already, or its grace period is not over. */
  | "not-due"
  /** A plan or an add-on is still live at the provider: erasing would leave a subscription charging a deleted account. */
  | "subscription-live"
  /** The user is a staff member: their account is not a customer's to erase. */
  | "staff-account"
  /** The business has another member, who has not asked to leave. Staff decide. */
  | "other-members";

export type ErasureOutcome =
  | {
      readonly kind: "erased";
      readonly closureId: string;
      readonly userId: string;
      readonly businessId: string;
      /** Files to remove from media storage now that the rows pointing at them are gone. */
      readonly storageKeys: readonly string[];
      /** Videos to delete from Vimeo now that the rows pointing at them are gone. */
      readonly vimeoIds: readonly string[];
    }
  | { readonly kind: "skipped"; readonly closureId: string; readonly reason: ErasureSkipReason };

export interface DueClosure {
  readonly id: string;
  readonly userId: string;
  readonly businessId: string;
  readonly eraseAfter: Date;
}

/** Open closures whose grace period is over, oldest first. */
export async function listClosuresDueForErasure(db: Database, now: Date, limit: number): Promise<DueClosure[]> {
  return db
    .select({
      id: accountClosures.id,
      userId: accountClosures.userId,
      businessId: accountClosures.businessId,
      eraseAfter: accountClosures.eraseAfter,
    })
    .from(accountClosures)
    .where(and(isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt), lte(accountClosures.eraseAfter, now)))
    .orderBy(asc(accountClosures.eraseAfter))
    .limit(limit);
}

/** The due, open closure the private support purge is preparing to erase. Staff connection only. */
export async function findClosureDueForErasure(
  db: Database,
  closureId: string,
  now: Date,
): Promise<DueClosure | null> {
  const [row] = await db
    .select({
      id: accountClosures.id,
      userId: accountClosures.userId,
      businessId: accountClosures.businessId,
      eraseAfter: accountClosures.eraseAfter,
    })
    .from(accountClosures)
    .where(
      and(
        eq(accountClosures.id, closureId),
        isNull(accountClosures.restoredAt),
        isNull(accountClosures.erasedAt),
        lte(accountClosures.eraseAfter, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function erasedUserEmail(userId: string): string {
  return `erased-${userId.toLowerCase()}@erased.invalid`;
}

export function erasedBusinessSlug(businessId: string): string {
  return `deleted-${businessId.replaceAll("-", "").slice(0, 12)}`;
}

type Runner = Database | ScopedTransaction;

/**
 * Why this closure must not be erased right now, or null when it may. Three things a person cannot be left to find out
 * the hard way: a plan or an add-on still running at the provider (the account was not really let go of), a staff
 * member's own account, and a business with another member who has not asked to leave.
 */
async function erasureBlock(
  db: Runner,
  closure: { readonly userId: string; readonly businessId: string },
  now: Date,
): Promise<ErasureSkipReason | null> {
  const { userId, businessId } = closure;
  const [staff] = await db.select({ userId: staffMembers.userId }).from(staffMembers).where(eq(staffMembers.userId, userId)).limit(1);
  if (staff !== undefined) return "staff-account";

  const others = await db
    .select({ userId: businessMembers.userId })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), ne(businessMembers.userId, userId)))
    .limit(1);
  if (others.length > 0) return "other-members";

  // A plan whose end was never recorded, or whose paid period has not run out, is still the customer's.
  const live = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.businessId, businessId),
        inArray(subscriptions.status, ["active", "past_due"]),
        or(isNull(subscriptions.cancelRequestedAt), sql`${subscriptions.paidThroughAt} > ${now}`),
      ),
    )
    .limit(1);
  if (live.length > 0) return "subscription-live";

  // An add-on is live the same way: paid for and not ended, or ended with paid time still to run, or a kept one whose
  // start date has not come. Past due counts, because the provider is still retrying the payment. Halted, cancelled and
  // unpaid checkouts are not: the provider takes nothing from them.
  const liveAddOns = await db
    .select({ id: addOnSubscriptions.id })
    .from(addOnSubscriptions)
    .where(
      and(
        eq(addOnSubscriptions.businessId, businessId),
        inArray(addOnSubscriptions.status, ["active", "past_due", "scheduled"]),
        or(
          isNull(addOnSubscriptions.endKind),
          sql`${addOnSubscriptions.currentPeriodEnd} > ${now}`,
          sql`${addOnSubscriptions.startAt} > ${now}`,
        ),
      ),
    )
    .limit(1);
  return liveAddOns.length > 0 ? "subscription-live" : null;
}

/**
 * Whether a closure may be erased now, without changing anything: null when it may, else why not. The caller asks
 * before it clears what lives outside this database, so a closure that will be skipped loses nothing. The erase
 * asks again under its own lock.
 */
export async function findErasureBlock(db: Database, input: { readonly closureId: string; readonly now: Date }): Promise<ErasureSkipReason | null> {
  const [closure] = await db.select().from(accountClosures).where(eq(accountClosures.id, input.closureId)).limit(1);
  if (
    closure === undefined ||
    closure.restoredAt !== null ||
    closure.erasedAt !== null ||
    closure.eraseAfter.getTime() > input.now.getTime()
  ) {
    return "not-due";
  }
  return erasureBlock(db, closure, input.now);
}

/**
 * Erases one closed account in a single transaction, or leaves it exactly as it was. The closure row is locked and
 * re-read first, so two runs (or a run racing a restore) can never both act, and an account restored a moment ago is
 * never erased. Returns what the caller must still clean up outside the database.
 */
export async function eraseClosedAccount(db: Database, input: { readonly closureId: string; readonly now: Date }): Promise<ErasureOutcome> {
  const { closureId, now } = input;
  return db.transaction(async (tx) => {
    const [closure] = await tx
      .select()
      .from(accountClosures)
      .where(eq(accountClosures.id, closureId))
      .limit(1)
      .for("update");
    const skipped = (reason: ErasureSkipReason): ErasureOutcome => ({ kind: "skipped", closureId, reason });
    if (
      closure === undefined ||
      closure.restoredAt !== null ||
      closure.erasedAt !== null ||
      closure.eraseAfter.getTime() > now.getTime()
    ) {
      return skipped("not-due");
    }
    const { userId, businessId } = closure;
    const block = await erasureBlock(tx, { userId, businessId }, now);
    if (block !== null) return skipped(block);

    const [user] = await tx
      .select({ email: users.email, phone: users.phoneNumber })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const pictureKeys = await tx
      .select({ key: directoryPictures.storageKey })
      .from(directoryPictures)
      .where(eq(directoryPictures.businessId, businessId));
    const mediaKeys = await tx
      .select({ key: mediaAssets.storageKey })
      .from(mediaAssets)
      .where(eq(mediaAssets.businessId, businessId));
    // A product's photo is a file too, at the key its ids build.
    const productPhotoKeys = (await listBusinessProductPhotoIds(tx, businessId)).map((photoId) => ({ key: `t/${businessId}/${photoId}/display` }));
    const storageKeys = [...pictureKeys, ...mediaKeys, ...productPhotoKeys].map((row) => row.key);
    // A video lives on Vimeo, not on our disk: the caller deletes it there once the rows are gone.
    const vimeoIds = (
      await tx.select({ id: directoryVideos.vimeoId }).from(directoryVideos).where(eq(directoryVideos.businessId, businessId))
    ).map((row) => row.id);

    // Private objects must already be purged; pending manifests prevent account scrubbing.
    await eraseSupportDataForUser(tx, userId);

    // Children before parents: bookings point at patients, practitioners and services.
    await tx.delete(appointments).where(eq(appointments.businessId, businessId));
    await tx.delete(appointmentServices).where(eq(appointmentServices.businessId, businessId));
    await tx.delete(practitionerHours).where(eq(practitionerHours.businessId, businessId));
    await tx.delete(practitionerLeave).where(eq(practitionerLeave.businessId, businessId));
    await tx.delete(practitioners).where(eq(practitioners.businessId, businessId));
    await tx.delete(patients).where(eq(patients.businessId, businessId));
    await tx.delete(appointmentSettings).where(eq(appointmentSettings.businessId, businessId));
    await tx.delete(bookingOtps).where(eq(bookingOtps.businessId, businessId));
    await tx.delete(services).where(eq(services.businessId, businessId));
    await tx.delete(businessAnnouncements).where(eq(businessAnnouncements.businessId, businessId));
    await tx.delete(businessClosures).where(eq(businessClosures.businessId, businessId));
    await tx.delete(businessHours).where(eq(businessHours.businessId, businessId));
    await tx.delete(businessModules).where(eq(businessModules.businessId, businessId));
    await tx.delete(businessProfiles).where(eq(businessProfiles.businessId, businessId));
    // What they told us for invoices goes. The invoices themselves stay: they are financial records (tax_invoices).
    await tx.delete(billingProfiles).where(eq(billingProfiles.businessId, businessId));
    await tx.delete(onboardingProgress).where(eq(onboardingProgress.businessId, businessId));
    await tx.delete(projectBriefs).where(eq(projectBriefs.businessId, businessId));
    await tx.delete(projects).where(eq(projects.businessId, businessId));
    await tx.delete(domains).where(eq(domains.businessId, businessId));
    await tx.delete(smsMessages).where(eq(smsMessages.businessId, businessId));
    await tx.delete(mediaAssets).where(eq(mediaAssets.businessId, businessId));

    // The directory listing: what the owner wrote and uploaded goes; the place itself is public and stays, unclaimed.
    await tx.delete(directoryBusinessCategories).where(eq(directoryBusinessCategories.businessId, businessId));
    await tx.delete(directoryBusinessFaqs).where(eq(directoryBusinessFaqs.businessId, businessId));
    await tx.delete(directoryBusinessProducts).where(eq(directoryBusinessProducts.businessId, businessId));
    await tx.delete(directoryBusinessServices).where(eq(directoryBusinessServices.businessId, businessId));
    await tx.delete(directoryBusinessProfiles).where(eq(directoryBusinessProfiles.businessId, businessId));
    await tx.delete(directoryDeals).where(eq(directoryDeals.businessId, businessId));
    await tx.delete(directoryPictures).where(eq(directoryPictures.businessId, businessId));
    await tx.delete(directoryVideos).where(eq(directoryVideos.businessId, businessId));
    await tx.delete(directoryClaims).where(eq(directoryClaims.businessId, businessId));
    await tx.delete(listingContent).where(eq(listingContent.businessId, businessId));
    await tx.delete(directoryListings).where(eq(directoryListings.businessId, businessId));

    // The sales lead that brought them (a name, email and phone) and the setup links sent to it.
    const leadRows = await tx.select({ id: leads.id }).from(leads).where(eq(leads.businessId, businessId));
    const leadIds = leadRows.map((row) => row.id);
    await tx
      .delete(setupInvites)
      .where(leadIds.length === 0 ? eq(setupInvites.businessId, businessId) : or(eq(setupInvites.businessId, businessId), inArray(setupInvites.leadId, leadIds)));
    await tx.delete(leads).where(eq(leads.businessId, businessId));

    await tx.delete(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)));

    // The business row stays, because payments and subscriptions point at it, but names nobody.
    await tx
      .update(businesses)
      .set({ name: "Deleted business", slug: erasedBusinessSlug(businessId), websiteUrl: null })
      .where(eq(businesses.id, businessId));

    // The person: every way back in, then the row itself, scrubbed.
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    // The nominee they named is another person's number, given to us for their own use of their rights, so it goes with them.
    await tx.delete(userPrivacySettings).where(eq(userPrivacySettings.userId, userId));
    if (user !== undefined) {
      await tx.delete(verifications).where(eq(verifications.identifier, user.email));
      await tx.delete(emailMessages).where(eq(emailMessages.toAddress, user.email));
      if (user.phone !== null) await tx.delete(accountOtps).where(eq(accountOtps.phone, user.phone));
    }
    await tx
      .update(users)
      .set({
        name: "Deleted user",
        email: erasedUserEmail(userId),
        emailVerified: false,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
      })
      .where(eq(users.id, userId));

    await tx.update(accountClosures).set({ erasedAt: now }).where(eq(accountClosures.id, closureId));
    return { kind: "erased", closureId, userId, businessId, storageKeys, vimeoIds };
  });
}
