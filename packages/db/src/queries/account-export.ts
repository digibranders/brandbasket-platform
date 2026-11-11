import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { businessProfiles, businesses, connectedAccounts, enquiries, notificationPreferences, sessions, users, websitePages } from "../schema";
import { findDirectoryProfile } from "./directory-business-profiles";
import { findLatestSubscriptionForBusiness, listPaymentsForBusiness } from "./billing";
import { findBillingProfile, listTaxInvoicesForBusiness } from "./tax-invoices";

/*
 * What an owner is given when they ask for a copy of their data (DPDP Act s.11): the account, the business and what was
 * entered about it, what was billed, and where they signed in from. Read on the staff connection, for ids that come only
 * from the signed-in session, never from a request. Support requests and consents are read separately by the caller, each
 * through the connection that fits it.
 *
 * The business's enquiries list is included (it is what the business was told about whoever got in touch), with the
 * customer's own status and note on each. Left out on purpose: password hashes and sign-in tokens (secrets, not
 * information about the person), and the details of the other people the business deals with (leads, patients,
 * bookings, reviews of it), which are other people's data that the business holds for itself and can already see in
 * its own dashboard.
 */

const MAX_PAYMENTS = 1000;
const MAX_ENQUIRIES = 5000;
const MAX_WEBSITE_PAGES = 2000;

export interface ExportedSession {
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** A person's own account row, without anything that signs in as them. */
export async function readExportedAccount(db: Database, userId: string) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      phoneNumber: users.phoneNumber,
      phoneNumberVerified: users.phoneNumberVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** The devices signed in as them: when, from which address and with which browser. Never the session token. */
export async function listExportedSessions(db: Database, userId: string): Promise<readonly ExportedSession[]> {
  const rows = await db
    .select({ startedAt: sessions.createdAt, expiresAt: sessions.expiresAt, ipAddress: sessions.ipAddress, userAgent: sessions.userAgent })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
  return rows;
}

/** The business, everything entered about it, and what was billed. */
export async function readExportedBusiness(db: Database, businessId: string) {
  const [business] = await db
    .select({ id: businesses.id, name: businesses.name, kind: businesses.kind, currency: businesses.currency, websiteUrl: businesses.websiteUrl, createdAt: businesses.createdAt })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.businessId, businessId)).limit(1);
  const [billingProfile, subscription, payments, taxInvoices, directoryProfile, enquiryRows, accountRows, pageRows] = await Promise.all([
    findBillingProfile(db, businessId),
    findLatestSubscriptionForBusiness(db, businessId),
    listPaymentsForBusiness(db, businessId, MAX_PAYMENTS),
    listTaxInvoicesForBusiness(db, businessId),
    findDirectoryProfile(db, businessId),
    db
      .select({
        kind: enquiries.kind,
        source: enquiries.source,
        name: enquiries.name,
        phone: enquiries.phone,
        email: enquiries.email,
        message: enquiries.message,
        status: enquiries.status,
        note: enquiries.note,
        receivedAt: enquiries.receivedAt,
      })
      .from(enquiries)
      .where(eq(enquiries.businessId, businessId))
      .orderBy(desc(enquiries.receivedAt), desc(enquiries.id))
      .limit(MAX_ENQUIRIES),
    db
      .select({
        platform: connectedAccounts.platform,
        handle: connectedAccounts.handle,
        url: connectedAccounts.url,
        status: connectedAccounts.status,
        checkedAt: connectedAccounts.checkedAt,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.businessId, businessId))
      .orderBy(asc(connectedAccounts.platform)),
    db
      .select({ url: websitePages.url, title: websitePages.title, lastSeenAt: websitePages.lastSeenAt })
      .from(websitePages)
      .where(eq(websitePages.businessId, businessId))
      .orderBy(asc(websitePages.url))
      .limit(MAX_WEBSITE_PAGES),
  ]);
  return {
    business: business ?? null,
    profile: profile ?? null,
    billingProfile,
    subscription,
    payments,
    taxInvoices,
    directoryProfile,
    enquiries: enquiryRows,
    connectedAccounts: accountRows,
    websitePages: pageRows,
  };
}

/** The email choices a person has made, for any business: only the ones they set (the rest follow the defaults). */
export async function readExportedNotificationPreferences(db: Database, userId: string) {
  return db
    .select({ businessId: notificationPreferences.businessId, topic: notificationPreferences.topic, email: notificationPreferences.email, updatedAt: notificationPreferences.updatedAt })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .orderBy(asc(notificationPreferences.businessId), asc(notificationPreferences.topic));
}
