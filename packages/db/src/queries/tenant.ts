import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "../scope";

/** A customer-side query ran in a transaction that withTenantScope did not open. */
export class TenantScopeMissingError extends Error {
  constructor() {
    super("This query must run inside withTenantScope: no business is set for the transaction.");
    this.name = "TenantScopeMissingError";
  }
}

/**
 * The business the transaction is scoped to, read back from the same setting row-level security uses. Customer-side
 * writes take the tenant from here rather than from an argument, so no caller can hand one in from a request.
 */
export async function currentBusinessId(tx: ScopedTransaction): Promise<string> {
  const result = await tx.execute<{ business_id: string | null }>(
    sql`select app_current_business_id()::text as business_id`,
  );
  const businessId = result.rows[0]?.business_id ?? null;
  if (businessId === null) throw new TenantScopeMissingError();
  return businessId;
}

/** Drizzle wraps driver errors, so the Postgres code is looked for along the whole cause chain. */
export function hasPostgresCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

/** The constraint (or unique index) a Postgres error names, searching the cause chain like hasPostgresCode; null if none. */
export function postgresConstraintOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    if ("constraint" in current && typeof current.constraint === "string") return current.constraint;
    current = current.cause;
  }
  return null;
}

export const UNIQUE_VIOLATION = "23505";
export const CHECK_VIOLATION = "23514";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from URLs and forms; one that is not a UUID cannot match a row, and Postgres would reject it loudly. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
