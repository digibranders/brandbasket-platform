import { sql } from "drizzle-orm";
import type { Database } from "./client";

/**
 * The transaction passed to withUserScope/withTenantScope callbacks. The type alone does not prove a scope was set:
 * a plain db.transaction() callback has the same type. Inside `work`, always use `tx`: the outer `db` is another
 * pooled connection with no scope. A nested tx.transaction() that calls set_config again re-scopes the outer
 * transaction when it commits.
 */
export type ScopedTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface TenantScope {
  readonly userId: string;
  readonly businessId: string;
}

/** The role customer requests run as. A constant, never input: it is interpolated into SET ROLE. */
const CUSTOMER_ROLE = "fynix_app";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertNotEmpty(value: string, name: string): void {
  if (value.trim() === "") throw new Error(`${name} must not be empty`);
}

/** Postgres would reject a malformed id deep inside a policy; fail early with a clear message instead. */
function assertUuid(value: string, name: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID, received "${value}"`);
}

/**
 * Runs `work` in a transaction where row-level security sees `userId`. The setting ends with the transaction.
 * Row-level security only narrows the app connection; staff connections have allow-all policies, so always pass
 * the app database here.
 */
export async function withUserScope<T>(
  db: Database,
  userId: string,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertNotEmpty(userId, "userId");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

/**
 * Runs `work` as the customer, inside a transaction already open on the staff connection. It opens a savepoint,
 * switches to `fynix_app` with SET LOCAL ROLE and scopes row-level security to `scope`, so `work` is held to
 * exactly what a customer request is: its business's rows only, and the one project transition the database
 * allows that role. Afterwards the staff role is restored for the rest of the transaction.
 *
 * This exists so that confirming a payment (staff-only billing writes) and submitting the project (a customer
 * transition) commit together. If `work` throws, the savepoint is rolled back, which undoes both its writes and the
 * role switch, and the error propagates; the caller decides whether the outer transaction survives it.
 *
 * Requires membership in fynix_app (migration 0132 grants that to fynix_staff and legacy fynix_staff).
 */
export async function withCustomerRole<T>(
  tx: ScopedTransaction,
  scope: TenantScope,
  work: (customerTx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertNotEmpty(scope.userId, "userId");
  assertUuid(scope.businessId, "businessId");
  return tx.transaction(async (savepoint) => {
    await savepoint.execute(sql.raw(`set local role ${CUSTOMER_ROLE}`));
    await savepoint.execute(
      sql`select set_config('app.user_id', ${scope.userId}, true), set_config('app.business_id', ${scope.businessId}, true)`,
    );
    const result = await work(savepoint);
    // Back to the connection's own role, with no tenant left in scope for whatever the caller does next.
    await savepoint.execute(sql`select set_config('app.user_id', '', true), set_config('app.business_id', '', true)`);
    await savepoint.execute(sql.raw("set local role none"));
    return result;
  });
}

/**
 * Like withUserScope, and also scopes row-level security to one business.
 * Row-level security only narrows the app connection; staff connections have allow-all policies, so always pass
 * the app database here.
 */
export async function withTenantScope<T>(
  db: Database,
  scope: TenantScope,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertNotEmpty(scope.userId, "userId");
  assertUuid(scope.businessId, "businessId");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.userId}, true), set_config('app.business_id', ${scope.businessId}, true)`,
    );
    return work(tx);
  });
}
