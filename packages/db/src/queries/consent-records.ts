import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { consentRecords, type ConsentEvent } from "../schema";

/**
 * What a person can consent to. One list so a typo cannot create a second spelling of the same purpose. The database
 * checks only the length, so a new purpose is added here.
 */
export const CONSENT_PURPOSES = ["account_terms", "lead_contact", "directory_contribution", "adult_declaration", "directory_enquiry", "patient_booking", "owner_contact"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * What a visitor to the directory agreed to when they posted a review or comment: the version of the notice they saw
 * and whether they ticked that they are 18 or over. It travels with the held post until the code is confirmed.
 */
export interface ContributionConsent {
  readonly noticeVersion: string;
  readonly adult: boolean;
  /** A reviewer let the business contact them about their review (N14); absent for a comment. */
  readonly ownerContact?: boolean;
}

/** Who the consent is from: what kind of thing the reference points at, and its id (a user id, a lead id, …). */
export interface ConsentSubject {
  readonly type: "user" | "lead" | "visitor" | "patient" | "enquiry";
  readonly ref: string;
}

export interface ConsentInput {
  readonly subject: ConsentSubject;
  /** A name from CONSENT_PURPOSES. Typed loosely so the database's own check is what refuses a bad one. */
  readonly purpose: ConsentPurpose | (string & {});
  readonly noticeVersion: string;
  /** Where it happened: "web" for a form on the site or the dashboard. */
  readonly channel: string;
  readonly language?: string;
  /** A keyed hash of the network address, made by the caller. Never the address itself. */
  readonly ipHash?: string | null;
}

export interface StoredConsent {
  readonly id: string;
  readonly purpose: string;
  readonly event: ConsentEvent;
  readonly noticeVersion: string;
  readonly language: string;
  readonly channel: string;
  readonly ipHash: string | null;
  readonly createdAt: Date;
}

async function insertConsent(db: Database, event: ConsentEvent, input: ConsentInput): Promise<void> {
  await db.insert(consentRecords).values({
    subjectType: input.subject.type,
    subjectRef: input.subject.ref,
    purpose: input.purpose,
    event,
    noticeVersion: input.noticeVersion,
    channel: input.channel,
    language: input.language ?? "en",
    ipHash: input.ipHash ?? null,
  });
}

/** Records that the subject agreed to `purpose` after seeing notice `noticeVersion`. */
export async function recordConsent(db: Database, input: ConsentInput): Promise<void> {
  await insertConsent(db, "given", input);
}

/** Records that the subject withdrew `purpose`. The agreement it ends stays in the history. */
export async function withdrawConsent(db: Database, input: ConsentInput): Promise<void> {
  await insertConsent(db, "withdrawn", input);
}

/** Everything the subject has given or withdrawn, oldest first. */
export async function listConsents(db: Database, subject: ConsentSubject): Promise<readonly StoredConsent[]> {
  return db
    .select({
      id: consentRecords.id,
      purpose: consentRecords.purpose,
      event: consentRecords.event,
      noticeVersion: consentRecords.noticeVersion,
      language: consentRecords.language,
      channel: consentRecords.channel,
      ipHash: consentRecords.ipHash,
      createdAt: consentRecords.createdAt,
    })
    .from(consentRecords)
    .where(and(eq(consentRecords.subjectType, subject.type), eq(consentRecords.subjectRef, subject.ref)))
    .orderBy(asc(consentRecords.createdAt), asc(consentRecords.id));
}
