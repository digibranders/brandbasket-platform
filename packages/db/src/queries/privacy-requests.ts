import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import type { DirectoryRef } from "./directory-refs";
import { deleteOwnDirectoryContribution, type DirectoryContributionTarget } from "./directory-visitors";
import {
  privacyRequestOtps,
  privacyRequests,
  type PrivacyRequestChannel,
  type PrivacyRequestKind,
  type PrivacyRequestOutcome,
  type PrivacyRequestStatus,
} from "../schema";

/** No 0, O, 1, I or L, so a reference read out over the phone is not mistaken. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERENCE_LENGTH = 8;

/** A new reference such as "PR-7K2M9QXD". 31^8 is about 850 billion, and the unique index refuses a repeat. */
export function newPrivacyRequestReference(): string {
  const bytes = randomBytes(REFERENCE_LENGTH);
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `PR-${code}`;
}

export interface NewPrivacyRequest {
  readonly kind: PrivacyRequestKind;
  readonly channel: PrivacyRequestChannel;
  readonly subjectName: string | null;
  readonly subjectContact: string;
  readonly subjectUserId?: string | null;
  readonly details: string | null;
  readonly receivedAt: Date;
  readonly dueAt: Date;
  /** Set when the person's identity was already checked, as it is for a signed-in request. */
  readonly identityVerifiedAt?: Date | null;
}

export interface StoredPrivacyRequest {
  readonly id: string;
  readonly reference: string;
  readonly kind: PrivacyRequestKind;
  readonly channel: PrivacyRequestChannel;
  readonly subjectName: string | null;
  readonly subjectContact: string;
  readonly subjectUserId: string | null;
  readonly details: string | null;
  readonly status: PrivacyRequestStatus;
  readonly identityVerifiedAt: Date | null;
  readonly receivedAt: Date;
  readonly dueAt: Date;
  readonly handledBy: string | null;
  readonly closedAt: Date | null;
  readonly outcome: PrivacyRequestOutcome | null;
  readonly resolution: string | null;
  /** The highest due-date stage staff have been emailed about: 0 none, 1 reminder, 2 urgent, 3 overdue. */
  readonly reminderStage: number;
}

function stored(row: typeof privacyRequests.$inferSelect): StoredPrivacyRequest {
  return {
    ...row,
    kind: row.kind as PrivacyRequestKind,
    channel: row.channel as PrivacyRequestChannel,
    status: row.status as PrivacyRequestStatus,
    outcome: row.outcome as PrivacyRequestOutcome | null,
  };
}

/** Adds a request to the tracker, received and not yet worked on. Returns its id and the reference the person quotes. */
export async function logPrivacyRequest(db: Database, input: NewPrivacyRequest): Promise<{ readonly id: string; readonly reference: string }> {
  const reference = newPrivacyRequestReference();
  const rows = await db
    .insert(privacyRequests)
    .values({
      reference,
      kind: input.kind,
      channel: input.channel,
      subjectName: input.subjectName,
      subjectContact: input.subjectContact,
      subjectUserId: input.subjectUserId ?? null,
      details: input.details,
      receivedAt: input.receivedAt,
      dueAt: input.dueAt,
      identityVerifiedAt: input.identityVerifiedAt ?? null,
    })
    .returning({ id: privacyRequests.id });
  const row = rows[0];
  if (row === undefined) throw new Error("A privacy request insert returned no row");
  return { id: row.id, reference };
}

/** Moves an open request on: who has it, whether the person is verified, and where it stands short of closing. */
export interface PrivacyRequestProgress {
  readonly status?: Exclude<PrivacyRequestStatus, "closed">;
  readonly handledBy?: string;
  readonly identityVerifiedAt?: Date;
}

/**
 * Records progress on a request that is still open; a closed request is left as it is, and so is an identity check already
 * made (the tracker is the proof of when it happened). Returns whether a row was changed.
 */
export async function updatePrivacyRequest(db: Database, id: string, progress: PrivacyRequestProgress): Promise<boolean> {
  const rows = await db
    .update(privacyRequests)
    .set({
      ...(progress.status === undefined ? {} : { status: progress.status }),
      ...(progress.handledBy === undefined ? {} : { handledBy: progress.handledBy }),
      ...(progress.identityVerifiedAt === undefined
        ? {}
        : { identityVerifiedAt: sql`coalesce(${privacyRequests.identityVerifiedAt}, ${progress.identityVerifiedAt})` }),
      updatedAt: new Date(),
    })
    .where(sql`${privacyRequests.id} = ${id} and ${privacyRequests.status} <> 'closed'`)
    .returning({ id: privacyRequests.id });
  return rows.length === 1;
}

/**
 * Closes a request with how it ended and what was done. The moment is passed in, not read in the query, so the caller's
 * clock is the one the due date is judged against. An already closed request is left alone; returns whether it was closed now.
 */
export async function closePrivacyRequest(
  db: Database,
  id: string,
  close: { readonly outcome: PrivacyRequestOutcome; readonly resolution: string; readonly closedAt: Date; readonly closedBy: string },
): Promise<boolean> {
  const rows = await db
    .update(privacyRequests)
    .set({ status: "closed", outcome: close.outcome, resolution: close.resolution, closedAt: close.closedAt, handledBy: close.closedBy, updatedAt: new Date() })
    .where(sql`${privacyRequests.id} = ${id} and ${privacyRequests.status} <> 'closed'`)
    .returning({ id: privacyRequests.id });
  return rows.length === 1;
}

/** Every request not yet closed, the soonest due first. */
export async function listOpenPrivacyRequests(db: Database): Promise<readonly StoredPrivacyRequest[]> {
  const rows = await db.select().from(privacyRequests).where(ne(privacyRequests.status, "closed")).orderBy(asc(privacyRequests.dueAt));
  return rows.map(stored);
}

/**
 * Records that staff were emailed about each request at the stage given, so the next night's email does not repeat it. A
 * stage never goes down, and a closed request is left as it is. Returns how many rows changed.
 */
export async function markPrivacyRequestsReminded(db: Database, reminded: readonly { readonly id: string; readonly stage: 1 | 2 | 3 }[]): Promise<number> {
  let changed = 0;
  for (const { id, stage } of reminded) {
    const rows = await db
      .update(privacyRequests)
      .set({ reminderStage: stage, updatedAt: new Date() })
      .where(and(eq(privacyRequests.id, id), lt(privacyRequests.reminderStage, stage), ne(privacyRequests.status, "closed")))
      .returning({ id: privacyRequests.id });
    changed += rows.length;
  }
  return changed;
}

/** Every open request, the soonest due first, then the closed ones, the most recently closed first. */
export async function listPrivacyRequests(db: Database): Promise<readonly StoredPrivacyRequest[]> {
  const open = await listOpenPrivacyRequests(db);
  const closed = await db.select().from(privacyRequests).where(eq(privacyRequests.status, "closed")).orderBy(desc(privacyRequests.closedAt)).limit(100);
  return [...open, ...closed.map(stored)];
}

// ---------------------------------------------------------------------------------------------------------------
// The code that proves a public-form request comes from the person whose address it names
// ---------------------------------------------------------------------------------------------------------------

/**
 * The kinds of request a person can make on the public form: everything but the two carried out automatically for a
 * visitor whose phone number the website already knew (`visitor_erasure`, `contribution_deletion`), which no emailed code can
 * stand in for. The rest wait for staff.
 */
export type PrivacyRequestFormKind = Exclude<PrivacyRequestKind, "visitor_erasure" | "contribution_deletion">;

/** What the person asked for, held until their code is confirmed. */
export interface PrivacyRequestOtpPayload {
  readonly kind: PrivacyRequestFormKind;
  readonly name: string | null;
  readonly details: string | null;
  readonly noticeVersion: string | null;
}

export interface NewPrivacyRequestOtp {
  readonly id: string;
  /** Trimmed and lowercased: the address the code is emailed to, and the contact the filed request keeps. */
  readonly email: string;
  readonly codeHash: string;
  readonly payload: PrivacyRequestOtpPayload;
  readonly expiresAt: Date;
}

export interface PrivacyRequestOtpRow {
  readonly id: string;
  readonly email: string;
  readonly codeHash: string;
  readonly payload: PrivacyRequestOtpPayload;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPrivacyRequestOtp(db: Database, input: NewPrivacyRequestOtp): Promise<string> {
  const rows = await db
    .insert(privacyRequestOtps)
    .values({ id: input.id, email: input.email, codeHash: input.codeHash, payload: input.payload, expiresAt: input.expiresAt })
    .returning({ id: privacyRequestOtps.id });
  const row = rows[0];
  if (row === undefined) throw new Error("A privacy request code insert returned no row");
  return row.id;
}

/** Null for an id that is not a UUID or names no row. */
export async function findPrivacyRequestOtp(db: Database, otpId: string): Promise<PrivacyRequestOtpRow | null> {
  if (!UUID.test(otpId)) return null;
  const rows = await db.select().from(privacyRequestOtps).where(eq(privacyRequestOtps.id, otpId)).limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row, payload: row.payload as PrivacyRequestOtpPayload };
}

export async function deletePrivacyRequestOtp(db: Database, otpId: string): Promise<boolean> {
  if (!UUID.test(otpId)) return false;
  const rows = await db.delete(privacyRequestOtps).where(eq(privacyRequestOtps.id, otpId)).returning({ id: privacyRequestOtps.id });
  return rows.length > 0;
}

export interface PrivacyRequestOtpAttempt {
  readonly otpId: string;
  readonly maxAttempts: number;
  readonly now: Date;
}

/**
 * Atomically claims one of the code's tries and returns the new count, or null when there was none to claim (no such code,
 * already used, expired, or out of tries). Every condition is in the one UPDATE's WHERE, so two confirms racing for the last
 * try can never both get it. The submitted code is compared only after a successful claim.
 */
export async function claimPrivacyRequestOtpAttempt(db: Database, input: PrivacyRequestOtpAttempt): Promise<{ readonly attempts: number } | null> {
  if (!UUID.test(input.otpId)) return null;
  const rows = await db
    .update(privacyRequestOtps)
    .set({ attempts: sql`${privacyRequestOtps.attempts} + 1` })
    .where(
      and(
        eq(privacyRequestOtps.id, input.otpId),
        lt(privacyRequestOtps.attempts, input.maxAttempts),
        isNull(privacyRequestOtps.verifiedAt),
        gt(privacyRequestOtps.expiresAt, input.now),
      ),
    )
    .returning({ attempts: privacyRequestOtps.attempts });
  return rows[0] ?? null;
}

/** A number with its middle hidden, for the record of an erasure: the tracker must not keep the number it just erased. */
function maskedContact(phone: string): string {
  return `${phone.slice(0, 3)}${"•".repeat(Math.max(phone.length - 6, 0))}${phone.slice(-3)}`;
}

/** A request a confirmed code filed for staff, due on `dueAt`. */
export interface FiledPrivacyRequest {
  readonly id: string;
  readonly reference: string;
  readonly dueAt: Date;
}

/** A request carried out the moment the number was proven: filed closed, with the number masked and nothing they wrote. */
function closedAutomaticRequest(input: {
  readonly kind: PrivacyRequestKind;
  readonly phone: string;
  readonly resolution: string;
  readonly now: Date;
  readonly dueAt: Date;
}): typeof privacyRequests.$inferInsert {
  return {
    reference: newPrivacyRequestReference(),
    kind: input.kind,
    channel: "web",
    subjectName: null,
    subjectContact: maskedContact(input.phone),
    details: null,
    status: "closed",
    outcome: "fulfilled",
    closedAt: input.now,
    resolution: input.resolution,
    receivedAt: input.now,
    dueAt: input.dueAt,
    identityVerifiedAt: input.now,
  };
}

async function insertRequest(tx: ScopedTransaction, values: typeof privacyRequests.$inferInsert): Promise<string> {
  const rows = await tx.insert(privacyRequests).values(values).returning({ id: privacyRequests.id });
  const row = rows[0];
  if (row === undefined) throw new Error("A privacy request insert returned no row");
  return row.id;
}

/** What a deletion record says was done, by what was deleted. */
const DELETION_RESOLUTIONS: Readonly<Record<DirectoryContributionTarget["kind"], string>> = {
  review: "Deleted automatically: one review, with the comments under it.",
  comment: "Deleted automatically: one comment.",
  business: "Deleted automatically: the visitor's review and comments on one business page.",
};

/**
 * Deletes one review or comment for a number that is already proven, and files the closed record of it, as one step of
 * the caller's transaction. Null when the number posted no such review or comment, and then nothing is filed. Used by a
 * confirmed code (receiveVerifiedPrivacyRequest) and by a visitor the website already recognises.
 */
export async function deleteContributionForProvenNumber(
  tx: ScopedTransaction,
  input: { readonly phone: string; readonly target: DirectoryContributionTarget; readonly now: Date; readonly dueAt: Date },
): Promise<{ readonly id: string; readonly reference: string; readonly business: DirectoryRef } | null> {
  const business = await deleteOwnDirectoryContribution(tx, { phone: input.phone, target: input.target });
  if (business === null) return null;
  const values = closedAutomaticRequest({
    kind: "contribution_deletion",
    phone: input.phone,
    resolution: DELETION_RESOLUTIONS[input.target.kind],
    now: input.now,
    dueAt: input.dueAt,
  });
  const id = await insertRequest(tx, values);
  return { id, reference: values.reference, business };
}

/**
 * Turns a confirmed code into the request it was holding, as one transaction: marks the code used (only if it is unused,
 * unexpired and within `maxAttempts`, so a double submit or a confirm after expiry creates nothing and returns null), files
 * the request for staff with what the person wrote, and deletes the code. The caller must already have claimed an attempt
 * and matched the code. `dueAt` is chosen by the caller from the day the request is received.
 */
export async function receiveVerifiedPrivacyRequest(
  db: Database,
  input: PrivacyRequestOtpAttempt & { readonly dueAt: Date },
): Promise<FiledPrivacyRequest | null> {
  if (!UUID.test(input.otpId)) return null;
  return db.transaction(async (tx) => {
    const used = await tx
      .update(privacyRequestOtps)
      .set({ verifiedAt: input.now })
      .where(
        and(
          eq(privacyRequestOtps.id, input.otpId),
          isNull(privacyRequestOtps.verifiedAt),
          gt(privacyRequestOtps.expiresAt, input.now),
          sql`${privacyRequestOtps.attempts} <= ${input.maxAttempts}`,
        ),
      )
      .returning({ email: privacyRequestOtps.email, payload: privacyRequestOtps.payload });
    const otp = used[0];
    if (otp === undefined) return null;
    const payload = otp.payload as PrivacyRequestOtpPayload;

    const reference = newPrivacyRequestReference();
    const id = await insertRequest(tx, {
      reference,
      kind: payload.kind,
      channel: "web",
      subjectName: payload.name,
      subjectContact: otp.email,
      details: payload.details,
      receivedAt: input.now,
      dueAt: input.dueAt,
      identityVerifiedAt: input.now,
    });
    await tx.delete(privacyRequestOtps).where(eq(privacyRequestOtps.id, input.otpId));
    return { id, reference, dueAt: input.dueAt };
  });
}

/** How long after expiry an unused code is kept, the same grace as booking and review codes. */
const OTP_PURGE_GRACE_MS = 60 * 60 * 1000;

/** Deletes codes that expired more than an hour before `now`. Safe to call from anywhere, any number of times. */
export async function purgeExpiredPrivacyRequestOtps(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - OTP_PURGE_GRACE_MS);
  const rows = await db.delete(privacyRequestOtps).where(lt(privacyRequestOtps.expiresAt, cutoff)).returning({ id: privacyRequestOtps.id });
  return rows.length;
}
