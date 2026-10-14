import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { setupInvites } from "../schema";

/** These run both directly and inside a transaction, for example when a new invite replaces an older one. */
type Runner = Database | ScopedTransaction;

const TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The link carries the token; the database only ever holds this hash. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export interface NewSetupInvite {
  readonly leadId: string;
  readonly email: string;
  readonly businessName: string;
  readonly createdByStaffId: string;
  readonly expiresInDays: number;
}

export interface SetupInvite {
  readonly id: string;
  readonly leadId: string;
  readonly email: string;
  readonly businessName: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

const INVITE_COLUMNS = {
  id: setupInvites.id,
  leadId: setupInvites.leadId,
  email: setupInvites.email,
  businessName: setupInvites.businessName,
  tokenHash: setupInvites.tokenHash,
  expiresAt: setupInvites.expiresAt,
} as const;

export interface CreatedSetupInvite {
  /** Shown once, in the email. It is never stored. */
  readonly token: string;
  readonly invite: SetupInvite;
}

export async function createSetupInvite(db: Runner, input: NewSetupInvite): Promise<CreatedSetupInvite> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const rows = await db
    .insert(setupInvites)
    .values({
      leadId: input.leadId,
      email: input.email,
      businessName: input.businessName,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + input.expiresInDays * MILLISECONDS_PER_DAY),
      createdByStaffId: input.createdByStaffId,
    })
    .returning(INVITE_COLUMNS);
  const invite = rows[0];
  if (invite === undefined) throw new Error("Setup invite insert returned no row");
  return { token, invite };
}

/** An invite is redeemable while it is unredeemed, unrevoked and unexpired. */
export async function findRedeemableInvite(db: Runner, token: string, now: Date = new Date()): Promise<SetupInvite | null> {
  const rows = await db
    .select(INVITE_COLUMNS)
    .from(setupInvites)
    .where(
      and(
        eq(setupInvites.tokenHash, hashInviteToken(token)),
        isNull(setupInvites.redeemedAt),
        isNull(setupInvites.revokedAt),
        gt(setupInvites.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Sending a new link invalidates any earlier one for that lead. */
export async function revokeOpenInvites(db: Runner, leadId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(setupInvites)
    .set({ revokedAt: now })
    .where(and(eq(setupInvites.leadId, leadId), isNull(setupInvites.redeemedAt), isNull(setupInvites.revokedAt)));
}
