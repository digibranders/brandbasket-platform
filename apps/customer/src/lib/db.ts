import "server-only";
import { createDatabase, type Database } from "@brandbasket/db";
import { z } from "zod";
import { serverEnv } from "./env";

// Kept on globalThis so hot reloads in development reuse pools instead of opening new ones.
const holder = globalThis as typeof globalThis & {
  brandbasketCustomerAppDb?: Database;
  brandbasketCustomerStaffDb?: Database;
  brandbasketCustomerPublicDb?: Database;
};

/**
 * Customer work, bound by row-level security. Every query runs inside withTenantScope (business data) or withUserScope
 * (the user's own rows) from @brandbasket/db, with ids taken from a guard's context, never from the request.
 */
export function getAppDb(): Database {
  holder.brandbasketCustomerAppDb ??= createDatabase(serverEnv().DATABASE_URL).db;
  return holder.brandbasketCustomerAppDb;
}

/**
 * The staff connection bypasses row-level security. Customer-facing code never uses it, except the sanctioned cases
 * below. A new exception needs the same kind of justification written here, in the same commit.
 *
 * - src/lib/guards.ts, reading the signed-in user's own open account closure (account_closures is staff-only). The user id
 *   comes only from the session; it reads one row's existence and erase date, and writes nothing.
 * - src/lib/guards.ts, reading the signed-in user's own affiliate record (requireAffiliate). The affiliate tables are
 *   staff-only by design and an affiliate has no business to scope a customer connection under. The user id comes only
 *   from the session, so an affiliate can only ever read their own record.
 */
export function getStaffDb(): Database {
  holder.brandbasketCustomerStaffDb ??= createDatabase(serverEnv().DATABASE_URL_STAFF).db;
  return holder.brandbasketCustomerStaffDb;
}

const publicEnvSchema = z.object({ DATABASE_URL_PUBLIC: z.url({ protocol: /^postgres(ql)?$/ }) });

/**
 * The intake connection (bb_public): it may only insert leads, rate-limit rows and outbox messages, so a mistake on a path
 * used by someone who is not signed in (a password reset email, say) cannot read customer data. Read lazily, so the app
 * runs without DATABASE_URL_PUBLIC until a feature needs it.
 */
export function getPublicDb(): Database {
  if (holder.brandbasketCustomerPublicDb === undefined) {
    const parsed = publicEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("DATABASE_URL_PUBLIC is missing or not a postgres URL. Add it to apps/customer/.env.local.");
    }
    holder.brandbasketCustomerPublicDb = createDatabase(parsed.data.DATABASE_URL_PUBLIC, { max: 5 }).db;
  }
  return holder.brandbasketCustomerPublicDb;
}
