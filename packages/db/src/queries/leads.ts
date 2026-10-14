import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  businesses,
  leads,
  payments,
  setupInvites,
  subscriptions,
  users,
  type BillingCurrency,
  type LeadStatus,
} from "../schema";

/** The account lookup also runs inside the onboarding transaction, so it accepts either runner. */
type Runner = Database | ScopedTransaction;

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`No lead with id ${leadId}`);
    this.name = "LeadNotFoundError";
  }
}

export interface NewLead {
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly phone: string;
  /** A business type slug owned by the marketing site; null for leads captured before the form asked. */
  readonly businessType: string | null;
  /**
   * Required, so no path can create a lead without deciding: every lead used to default to USD, which asked Indian
   * customers for $75. Callers derive it from the phone number (billingCurrencyForPhone in @fynix/shared).
   */
  readonly currency: BillingCurrency;
  readonly message: string | null;
}

export interface Lead {
  readonly id: string;
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly phone: string;
  readonly businessType: string | null;
  readonly currency: BillingCurrency;
  readonly message: string | null;
  readonly status: LeadStatus;
  readonly notes: string | null;
  readonly businessId: string | null;
  /** Set only when staff attached an existing account to this lead's business by hand. */
  readonly attachedByStaffId: string | null;
  readonly attachedAt: Date | null;
  readonly createdAt: Date;
}

const LEAD_COLUMNS = {
  id: leads.id,
  name: leads.name,
  businessName: leads.businessName,
  email: leads.email,
  phone: leads.phone,
  businessType: leads.businessType,
  currency: leads.currency,
  message: leads.message,
  status: leads.status,
  notes: leads.notes,
  businessId: leads.businessId,
  attachedByStaffId: leads.attachedByStaffId,
  attachedAt: leads.attachedAt,
  createdAt: leads.createdAt,
} as const;

/**
 * Called from the public marketing form. The id is generated here rather than read back with RETURNING, because
 * RETURNING needs SELECT privilege and the fynix_public role deliberately has none on this table.
 */
export async function createLead(db: Database, lead: NewLead): Promise<{ readonly id: string }> {
  const id = uuidv7();
  await db.insert(leads).values({ ...lead, id });
  return { id };
}

export async function listLeads(db: Database, filter: { readonly status?: LeadStatus }): Promise<Lead[]> {
  const query = db.select(LEAD_COLUMNS).from(leads).orderBy(desc(leads.createdAt));
  return filter.status === undefined ? query : query.where(eq(leads.status, filter.status));
}

export async function findLead(db: Database, id: string): Promise<Lead | null> {
  const rows = await db.select(LEAD_COLUMNS).from(leads).where(eq(leads.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * The account behind a lead's email, if one was ever created. Emails are stored as Better Auth normalised them
 * (trimmed and lowercased), so the lookup lowercases too rather than relying on the caller.
 */
export async function findUserIdByEmail(db: Runner, email: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Statuses only the system sets: creating the customer's account sets `account_created`, and a confirmed first
 * payment sets `paid`. Staff can neither choose them nor move a lead out of them.
 */
export const SYSTEM_LEAD_STATUSES = ["account_created", "paid"] as const satisfies readonly LeadStatus[];
export type SystemLeadStatus = (typeof SYSTEM_LEAD_STATUSES)[number];
/** The statuses staff may put a lead in by hand. */
export type StaffLeadStatus = Exclude<LeadStatus, SystemLeadStatus>;

export function isSystemLeadStatus(status: LeadStatus): status is SystemLeadStatus {
  return (SYSTEM_LEAD_STATUSES as readonly LeadStatus[]).includes(status);
}

/** A status only the system sets was asked for by hand. Nothing was written. */
export class SystemLeadStatusError extends Error {
  constructor(status: LeadStatus) {
    super(`Lead status "${status}" is set by the system and cannot be chosen by hand.`);
    this.name = "SystemLeadStatusError";
  }
}

/**
 * Anything but the status. Status changes go through setLeadStatusUnlessSystemSet, so nothing can move a lead into
 * or out of a system status by accident.
 */
export interface LeadUpdate {
  readonly currency?: BillingCurrency;
  readonly notes?: string | null;
  readonly businessId?: string;
}

export async function updateLead(db: Database, id: string, update: LeadUpdate): Promise<void> {
  // updatedAt is refreshed by the column's $onUpdate in schema/columns.ts.
  await db.update(leads).set(update).where(eq(leads.id, id));
}

export type LeadStatusChange = "updated" | "system-set" | "not-found";

/**
 * Moves a lead to a status staff may set, unless it is already in a status only the system sets (then nothing
 * changes and `system-set` is returned). The check is in the UPDATE itself, so a lead that is marked paid while a
 * staff member has the page open is never pulled back. Refuses a system status outright.
 */
export async function setLeadStatusUnlessSystemSet(
  db: Database,
  id: string,
  status: StaffLeadStatus,
): Promise<LeadStatusChange> {
  if (isSystemLeadStatus(status)) throw new SystemLeadStatusError(status);
  const updated = await db
    .update(leads)
    .set({ status })
    .where(and(eq(leads.id, id), notInArray(leads.status, [...SYSTEM_LEAD_STATUSES])))
    .returning({ id: leads.id });
  if (updated.length > 0) return "updated";
  const found = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, id)).limit(1);
  return found.length === 0 ? "not-found" : "system-set";
}

/**
 * Marks the lead (or leads) behind a business as paid, and returns how many changed. Staff connection only.
 *
 * The lead is found through `leads.business_id`, which both account paths set, and also through
 * `setup_invites.business_id`, so a lead whose own link was never written back is still found. A staff-attached
 * account has no invite at all, which is why the invite cannot be the only route. Leads already marked paid are
 * left alone, so a repeated delivery changes nothing.
 */
export async function markLeadPaidForBusiness(db: Runner, businessId: string): Promise<number> {
  const invitedLeads = db
    .select({ leadId: setupInvites.leadId })
    .from(setupInvites)
    .where(eq(setupInvites.businessId, businessId));
  const updated = await db
    .update(leads)
    .set({ status: "paid" })
    .where(and(or(eq(leads.businessId, businessId), inArray(leads.id, invitedLeads)), ne(leads.status, "paid")))
    .returning({ id: leads.id });
  return updated.length;
}

/** What changing a lead's billing currency did. */
export type LeadCurrencyChange = "changed" | "unchanged" | "locked" | "not-found";

/**
 * Whether billing has started for a business: any subscription (a checkout opened, paid or not) or any payment. From
 * then on its currency is fixed — every amount recorded so far is in it.
 */
export async function isBillingStarted(db: Runner, businessId: string): Promise<boolean> {
  const [subscription, payment] = await Promise.all([
    db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.businessId, businessId)).limit(1),
    db.select({ id: payments.id }).from(payments).where(eq(payments.businessId, businessId)).limit(1),
  ]);
  return subscription.length > 0 || payment.length > 0;
}

/**
 * Changes the currency a lead is billed in, and — once the customer has signed up — the currency of the business
 * their checkout actually reads.
 *
 * This used to update the lead alone. A business takes its currency from the lead at the moment the customer signs
 * up (onboarding.ts), so a change made after that reached nothing: the lead said INR, checkout still asked for $75.
 *
 * Refused once billing has started (isBillingStarted), because amounts already recorded are in the old currency.
 * A referral code applied but not yet paid on is removed: a code is a flat discount in one currency, and the customer
 * can apply one valid in the new currency.
 *
 * Takes the same row lock on the business that every billing change takes (lockBusinessForBilling in ./billing —
 * not imported, because that module imports this one), so a checkout starting at the same moment runs strictly
 * before or after this, never interleaved.
 */
export async function changeLeadCurrency(
  db: Database,
  leadId: string,
  currency: BillingCurrency,
): Promise<LeadCurrencyChange> {
  return db.transaction(async (tx): Promise<LeadCurrencyChange> => {
    const foundLead = await tx
      .select({ currency: leads.currency, businessId: leads.businessId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1)
      .for("update");
    const lead = foundLead[0];
    if (lead === undefined) return "not-found";

    if (lead.businessId === null) {
      if (lead.currency === currency) return "unchanged";
      await tx.update(leads).set({ currency }).where(eq(leads.id, leadId));
      return "changed";
    }

    const foundBusiness = await tx
      .select({ currency: businesses.currency })
      .from(businesses)
      .where(eq(businesses.id, lead.businessId))
      .limit(1)
      .for("no key update");
    const business = foundBusiness[0];
    if (business === undefined) throw new Error(`Lead ${leadId} points at a business that does not exist`);

    if (lead.currency === currency && business.currency === currency) return "unchanged";
    if (await isBillingStarted(tx, lead.businessId)) return "locked";

    if (lead.currency !== currency) await tx.update(leads).set({ currency }).where(eq(leads.id, leadId));
    if (business.currency !== currency) {
      await tx
        .update(businesses)
        .set({ currency, referralCodeId: null })
        .where(eq(businesses.id, lead.businessId));
    }
    return "changed";
  });
}

