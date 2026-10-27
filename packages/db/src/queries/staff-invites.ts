import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { staffInvites, type StaffRole } from "../schema";
import { hashInviteToken } from "./invites";

/** These run both directly and inside a transaction. Use with the staff connection. */
type Runner = Database | ScopedTransaction;

const TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface NewStaffInvite {
  readonly email: string;
  readonly role: StaffRole;
  readonly invitedBy: string;
  readonly expiresInDays: number;
}

export interface StaffInvite {
  readonly id: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly expiresAt: Date;
  readonly invitedBy: string;
  readonly createdAt: Date;
}

export interface CreatedStaffInvite {
  /** Shown once, in the email. It is never stored. */
  readonly token: string;
  readonly invite: StaffInvite;
}

const COLUMNS = {
  id: staffInvites.id,
  email: staffInvites.email,
  role: staffInvites.role,
  expiresAt: staffInvites.expiresAt,
  invitedBy: staffInvites.invitedBy,
  createdAt: staffInvites.createdAt,
} as const;

const open = and(isNull(staffInvites.acceptedAt), isNull(staffInvites.revokedAt));

/** Revokes any open invite for the address and creates a new one in one transaction, so only the newest link works. */
export async function createStaffInvite(db: Database, input: NewStaffInvite, now: Date = new Date()): Promise<CreatedStaffInvite> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return db.transaction(async (tx) => {
    await tx.update(staffInvites).set({ revokedAt: now }).where(and(eq(staffInvites.email, email), open));
    const rows = await tx
      .insert(staffInvites)
      .values({
        email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now.getTime() + input.expiresInDays * MILLISECONDS_PER_DAY),
        invitedBy: input.invitedBy,
      })
      .returning(COLUMNS);
    const invite = rows[0];
    if (invite === undefined) throw new Error("Staff invite insert returned no row");
    return { token, invite };
  });
}

/** The invite behind a link, while it is unaccepted, unrevoked and unexpired. */
export async function findUsableStaffInvite(db: Runner, token: string, now: Date = new Date()): Promise<StaffInvite | null> {
  const rows = await db
    .select(COLUMNS)
    .from(staffInvites)
    .where(and(eq(staffInvites.tokenHash, hashInviteToken(token)), open, gt(staffInvites.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

/** An unaccepted, unrevoked invite by id, for a resend. An expired one still counts: resending replaces it. */
export async function findOpenStaffInvite(db: Runner, inviteId: string): Promise<StaffInvite | null> {
  const rows = await db.select(COLUMNS).from(staffInvites).where(and(eq(staffInvites.id, inviteId), open)).limit(1);
  return rows[0] ?? null;
}

/**
 * Marks the invite accepted if it is still usable. One conditional update, so two submissions of the same link (two tabs,
 * a double click) cannot both succeed: the loser gets false.
 */
export async function claimStaffInvite(db: Runner, inviteId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(staffInvites)
    .set({ acceptedAt: now })
    .where(and(eq(staffInvites.id, inviteId), open, gt(staffInvites.expiresAt, now)))
    .returning({ id: staffInvites.id });
  return rows.length === 1;
}

/** Invites not yet accepted or revoked, newest first; expired ones included so the page can offer a resend. */
export async function listOpenStaffInvites(db: Runner): Promise<readonly StaffInvite[]> {
  return db.select(COLUMNS).from(staffInvites).where(open).orderBy(desc(staffInvites.createdAt));
}
