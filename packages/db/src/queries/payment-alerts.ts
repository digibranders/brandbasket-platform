import { and, asc, count, eq, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businessMembers, businesses, payments, users } from "../schema";
import { PAYMENT_COLUMNS, type Payment } from "./billing";

type Runner = Database;

/** The person behind a business: its earliest owner. Null fields when the business has no owner on record. */
export interface AlertPerson {
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/** A payment with who paid it, for the alert staff read in Teams. Staff connection. */
export interface PaymentAlertBase {
  readonly payment: Payment;
  readonly business: { readonly id: string; readonly name: string; readonly websiteUrl: string | null; readonly stateCode: string | null };
  readonly owner: AlertPerson;
  /** Which captured payment of the business this is, counting this one: 1 is the customer's first. */
  readonly captured: number;
}

/** The business and its earliest owner, by business id. Null when there is no such business. */
export async function findBusinessAlertDetails(
  db: Runner,
  businessId: string,
): Promise<{ readonly business: PaymentAlertBase["business"]; readonly owner: AlertPerson } | null> {
  const found = await db
    .select({ id: businesses.id, name: businesses.name, websiteUrl: businesses.websiteUrl, stateCode: businesses.stateCode })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const business = found[0];
  if (business === undefined) return null;
  const owners = await db
    .select({ name: users.name, email: users.email, phone: users.phoneNumber })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")))
    .orderBy(asc(businessMembers.createdAt), asc(businessMembers.userId))
    .limit(1);
  const owner = owners[0];
  return { business, owner: owner === undefined ? { name: null, email: null, phone: null } : { name: owner.name, email: owner.email, phone: owner.phone } };
}

export async function findPaymentAlertBase(db: Runner, paymentId: string): Promise<PaymentAlertBase | null> {
  const rows = await db.select(PAYMENT_COLUMNS).from(payments).where(eq(payments.id, paymentId)).limit(1);
  const payment = rows[0];
  if (payment === undefined) return null;
  const details = await findBusinessAlertDetails(db, payment.businessId);
  if (details === null) return null;
  // Earlier captured payments of the business, this one included: the id breaks a tie on the same instant.
  const earlier = await db
    .select({ n: count() })
    .from(payments)
    .where(
      and(
        eq(payments.businessId, payment.businessId),
        eq(payments.status, "captured"),
        ne(payments.kind, "charge"),
        or(
          sql`${payments.createdAt} < ${payment.createdAt}`,
          and(eq(payments.createdAt, payment.createdAt), lte(payments.id, payment.id)),
        ),
      ),
    );
  return { payment, ...details, captured: earlier[0]?.n ?? 1 };
}
