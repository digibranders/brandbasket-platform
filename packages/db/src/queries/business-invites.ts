import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { businessInvites, type BusinessInvite } from "../schema/business-invites";
import { businesses, businessMembers } from "../schema/businesses";
import type { ScopedTransaction } from "../scope";
import { hashInviteToken } from "./invites";
import { currentBusinessId, hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

const TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const BUSINESS_INVITE_DAYS = 7;

/** The roles an owner may invite someone as. Ownership is never handed out by invite. */
export type InvitableRole = "editor" | "viewer";

/** The invite without its token hash: what a page may show. */
export type BusinessInviteView = Omit<BusinessInvite, "tokenHash">;

const VIEW_COLUMNS = {
  id: businessInvites.id,
  businessId: businessInvites.businessId,
  email: businessInvites.email,
  role: businessInvites.role,
  invitedBy: businessInvites.invitedBy,
  expiresAt: businessInvites.expiresAt,
  acceptedAt: businessInvites.acceptedAt,
  revokedAt: businessInvites.revokedAt,
  createdAt: businessInvites.createdAt,
} as const;

export class BusinessInviteOpenError extends Error {
  constructor() {
    super("This address already has an open invite to this business.");
    this.name = "BusinessInviteOpenError";
  }
}

/**
 * Owner side, inside withTenantScope: invites `email` to the scoped business. Row-level security lets only the owner
 * do it (anyone else gets a Postgres permission error). The token is returned once, for the email link; only its
 * hash is stored.
 */
export async function createBusinessInvite(
  tx: ScopedTransaction,
  input: { readonly invitedBy: string; readonly email: string; readonly role: InvitableRole; readonly now?: Date },
): Promise<{ readonly token: string; readonly invite: BusinessInviteView }> {
  const businessId = await currentBusinessId(tx);
  const now = input.now ?? new Date();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  try {
    // A savepoint, so a duplicate invite leaves the caller's transaction usable.
    const [invite] = await tx.transaction((savepoint) =>
      savepoint
        .insert(businessInvites)
        .values({
          businessId,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          tokenHash: hashInviteToken(token),
          invitedBy: input.invitedBy,
          expiresAt: new Date(now.getTime() + BUSINESS_INVITE_DAYS * MILLISECONDS_PER_DAY),
          createdAt: now,
        })
        .returning(VIEW_COLUMNS),
    );
    if (invite === undefined) throw new Error("The invite was not saved.");
    return { token, invite };
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new BusinessInviteOpenError();
    throw error;
  }
}

/** Owner side: every invite of the scoped business, newest first. Anyone but the owner sees none. */
export async function listBusinessInvites(tx: ScopedTransaction): Promise<BusinessInviteView[]> {
  const businessId = await currentBusinessId(tx);
  return tx.select(VIEW_COLUMNS).from(businessInvites).where(eq(businessInvites.businessId, businessId)).orderBy(desc(businessInvites.createdAt));
}

/** Owner side: revokes an open invite. False when there is no open invite of this business with that id. */
export async function revokeBusinessInvite(tx: ScopedTransaction, inviteId: string, now: Date = new Date()): Promise<boolean> {
  if (!isUuid(inviteId)) return false;
  const businessId = await currentBusinessId(tx);
  const revoked = await tx
    .update(businessInvites)
    .set({ revokedAt: now })
    .where(and(eq(businessInvites.id, inviteId), eq(businessInvites.businessId, businessId), isNull(businessInvites.acceptedAt), isNull(businessInvites.revokedAt)))
    .returning({ id: businessInvites.id });
  return revoked.length > 0;
}

export type BusinessInviteRefusal = "not_found" | "revoked" | "expired" | "used" | "wrong_email";

export interface BusinessInviteDetails {
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly email: string;
  readonly role: InvitableRole;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export type CheckBusinessInviteResult =
  | { readonly kind: "valid"; readonly invite: BusinessInviteDetails }
  | { readonly kind: "refused"; readonly reason: BusinessInviteRefusal; readonly invite?: BusinessInviteDetails };

/** Reads an invitation and its business name by token. Returns null when not found. */
export async function findBusinessInviteByToken(db: Database, token: string): Promise<BusinessInviteDetails | null> {
  const rows = await db
    .select({
      id: businessInvites.id,
      businessId: businessInvites.businessId,
      businessName: businesses.name,
      email: businessInvites.email,
      role: businessInvites.role,
      expiresAt: businessInvites.expiresAt,
      acceptedAt: businessInvites.acceptedAt,
      revokedAt: businessInvites.revokedAt,
      createdAt: businessInvites.createdAt,
    })
    .from(businessInvites)
    .innerJoin(businesses, eq(businessInvites.businessId, businesses.id))
    .where(eq(businessInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    role: row.role === "viewer" ? "viewer" : "editor",
  };
}

/** Pure check of an invite's validity against expiry, revocation, use, and optional email match. */
export function evaluateBusinessInvite(
  invite: BusinessInviteDetails | null,
  options?: { readonly userEmail?: string | null; readonly now?: Date },
): CheckBusinessInviteResult {
  if (invite === null) return { kind: "refused", reason: "not_found" };
  const now = options?.now ?? new Date();
  if (invite.revokedAt !== null) return { kind: "refused", reason: "revoked", invite };
  if (invite.acceptedAt !== null) return { kind: "refused", reason: "used", invite };
  if (invite.expiresAt.getTime() <= now.getTime()) return { kind: "refused", reason: "expired", invite };
  if (options?.userEmail !== undefined && options.userEmail !== null) {
    if (invite.email !== options.userEmail.trim().toLowerCase()) {
      return { kind: "refused", reason: "wrong_email", invite };
    }
  }
  return { kind: "valid", invite };
}

/** Checks the state of an invitation without mutating it, for the invite landing page or sign-up. */
export async function checkBusinessInvite(
  db: Database,
  input: { readonly token: string; readonly userEmail?: string | null; readonly now?: Date },
): Promise<CheckBusinessInviteResult> {
  const invite = await findBusinessInviteByToken(db, input.token);
  return evaluateBusinessInvite(invite, input);
}

export type AcceptBusinessInviteResult =
  | { readonly kind: "accepted"; readonly businessId: string; readonly role: InvitableRole }
  | { readonly kind: "refused"; readonly reason: BusinessInviteRefusal };

/**
 * Staff connection (the accept page's server code, after sign-in): turns an invite into a membership. The invite must
 * be open, unexpired and addressed to the signed-in user's email. Someone who is already a member keeps the role they
 * have. The invite row is locked, so a link opened twice at once adds one membership.
 */
export async function acceptBusinessInvite(
  db: Database,
  input: { readonly token: string; readonly userId: string; readonly userEmail: string; readonly now?: Date },
): Promise<AcceptBusinessInviteResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(businessInvites)
      .where(eq(businessInvites.tokenHash, hashInviteToken(input.token)))
      .limit(1)
      .for("update");
    const refused = (reason: BusinessInviteRefusal): AcceptBusinessInviteResult => ({ kind: "refused", reason });
    if (invite === undefined) return refused("not_found");
    if (invite.revokedAt !== null) return refused("revoked");
    if (invite.acceptedAt !== null) return refused("used");
    if (invite.expiresAt.getTime() <= now.getTime()) return refused("expired");
    if (invite.email !== input.userEmail.trim().toLowerCase()) return refused("wrong_email");
    if (invite.role !== "editor" && invite.role !== "viewer") throw new Error(`Invite ${invite.id} has role ${invite.role}, which no invite may carry.`);

    await tx.insert(businessMembers).values({ businessId: invite.businessId, userId: input.userId, role: invite.role }).onConflictDoNothing();
    await tx.update(businessInvites).set({ acceptedAt: now }).where(eq(businessInvites.id, invite.id));
    return { kind: "accepted", businessId: invite.businessId, role: invite.role };
  });
}
