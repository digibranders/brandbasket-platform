import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, businessMembers, leads, setupInvites, type BillingCurrency, type BusinessKind } from "../schema";
import { slugify } from "../slug";
import { revokeOpenInvites } from "./invites";
import { findUserIdByEmail, LeadNotFoundError } from "./leads";
import { insertOnboardingProject } from "./projects";
import { hasPostgresCode, UNIQUE_VIOLATION } from "./tenant";

const SLUG_ATTEMPTS = 3;
const SLUG_SUFFIX_BYTES = 3;

export class LeadAlreadyHasBusinessError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} already has a business.`);
    this.name = "LeadAlreadyHasBusinessError";
  }
}

export class NoAccountForLeadError extends Error {
  constructor(leadId: string) {
    super(`No account exists for the email on lead ${leadId}.`);
    this.name = "NoAccountForLeadError";
  }
}

export class InviteNoLongerRedeemableError extends Error {
  constructor(inviteId: string) {
    super(`Setup invite ${inviteId} was already redeemed, revoked or expired.`);
    this.name = "InviteNoLongerRedeemableError";
  }
}

export interface InviteRedemption {
  readonly inviteId: string;
  readonly leadId: string;
  readonly businessName: string;
  readonly userId: string;
}

/**
 * Slugs are unique and two people can redeem invites for the same business name at once. Each attempt runs in its
 * own savepoint (a nested Drizzle transaction), because a failed statement would otherwise abort the whole
 * transaction and make a retry impossible.
 */
export async function insertBusiness(
  tx: ScopedTransaction,
  name: string,
  currency: BillingCurrency,
  kind: BusinessKind = "website",
): Promise<{ readonly id: string }> {
  const base = slugify(name);
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(SLUG_SUFFIX_BYTES).toString("hex")}`;
    try {
      return await tx.transaction(async (savepoint) => {
        const created = await savepoint
          .insert(businesses)
          .values({ name, slug, currency, kind })
          .returning({ id: businesses.id });
        const business = created[0];
        if (business === undefined) throw new Error("Business insert returned no row");
        return business;
      });
    } catch (error) {
      if (!hasPostgresCode(error, UNIQUE_VIOLATION) || attempt === SLUG_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error(`Could not find a free slug for "${name}"`);
}

/**
 * Creates the tenant for a redeemed invite: business, its onboarding project, owner membership, closed invite and
 * updated lead, all or nothing. The account itself is created first by @firstfold/auth, which owns the invite-only gate.
 *
 * Closing the invite is the gate: the UPDATE only matches an invite that is still redeemable, so a link submitted
 * twice at once creates exactly one business and the loser rolls back.
 */
export async function redeemInviteIntoBusiness(
  db: Database,
  redemption: InviteRedemption,
): Promise<{ readonly businessId: string }> {
  const now = new Date();
  return db.transaction(async (tx) => {
    // Closing the invite first is the gate: a link submitted twice fails here, before anything is created.
    const closed = await tx
      .update(setupInvites)
      .set({ redeemedAt: now })
      .where(
        and(
          eq(setupInvites.id, redemption.inviteId),
          isNull(setupInvites.redeemedAt),
          isNull(setupInvites.revokedAt),
          gt(setupInvites.expiresAt, now),
        ),
      )
      .returning({ id: setupInvites.id });
    if (closed.length === 0) throw new InviteNoLongerRedeemableError(redemption.inviteId);

    // The business inherits what staff chose on the lead, so the first charge uses the agreed currency.
    const leadRows = await tx
      .select({ currency: leads.currency })
      .from(leads)
      .where(eq(leads.id, redemption.leadId))
      .limit(1);
    const lead = leadRows[0];
    if (lead === undefined) throw new LeadNotFoundError(redemption.leadId);

    const business = await insertBusiness(tx, redemption.businessName, lead.currency);

    // Billing is on hold; when it returns, the project is opened on payment confirmation instead (spec §5.3).
    await insertOnboardingProject(tx, business.id);
    await tx.insert(businessMembers).values({ businessId: business.id, userId: redemption.userId, role: "owner" });
    await tx.update(setupInvites).set({ businessId: business.id }).where(eq(setupInvites.id, redemption.inviteId));
    await tx
      .update(leads)
      .set({ status: "account_created", businessId: business.id })
      .where(eq(leads.id, redemption.leadId));

    return { businessId: business.id };
  });
}

export interface AccountAttachment {
  readonly leadId: string;
  /** The staff member performing the repair, recorded on the lead. */
  readonly attachedByStaffId: string;
}

/**
 * Staff repair for a customer left with an account but no business: the account is created first and the
 * redemption transaction can still fail after it, and once the invite is gone the customer cannot redeem their
 * way out. This attaches the account behind the lead's email to a new business, exactly as a redemption would.
 *
 * Refuses a lead that already has a business, so it cannot give one customer two tenants, and selecting the lead
 * FOR UPDATE makes that check the gate: a second call blocks until the first commits and then sees the business.
 * Any setup link still open for the lead is revoked in the same transaction, so a later redemption of it cannot
 * create a second business for the same lead.
 */
export async function attachAccountToNewBusiness(
  db: Database,
  attachment: AccountAttachment,
): Promise<{ readonly businessId: string; readonly businessName: string }> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        email: leads.email,
        businessName: leads.businessName,
        businessId: leads.businessId,
        currency: leads.currency,
      })
      .from(leads)
      .where(eq(leads.id, attachment.leadId))
      .limit(1)
      .for("update");
    const lead = rows[0];
    if (lead === undefined) throw new LeadNotFoundError(attachment.leadId);
    if (lead.businessId !== null) throw new LeadAlreadyHasBusinessError(attachment.leadId);

    const userId = await findUserIdByEmail(tx, lead.email);
    if (userId === null) throw new NoAccountForLeadError(attachment.leadId);

    const business = await insertBusiness(tx, lead.businessName, lead.currency);

    // Billing is on hold; when it returns, the project is opened on payment confirmation instead (spec §5.3).
    await insertOnboardingProject(tx, business.id);
    await tx.insert(businessMembers).values({ businessId: business.id, userId, role: "owner" });
    await revokeOpenInvites(tx, attachment.leadId, now);
    await tx
      .update(leads)
      .set({
        status: "account_created",
        businessId: business.id,
        attachedByStaffId: attachment.attachedByStaffId,
        attachedAt: now,
      })
      .where(eq(leads.id, attachment.leadId));

    return { businessId: business.id, businessName: lead.businessName };
  });
}
