import "server-only";
import { createDatabase, type Database } from "@firstfold/db";
import { serverEnv } from "@/lib/server/env";

// Kept on globalThis so hot reloads in development reuse the pool instead of opening new ones.
const holder = globalThis as typeof globalThis & { firstfoldAdminDb?: Database };

/**
 * The staff connection, and the only one this app has.
 *
 * Unlike the platform there is no customer connection to confuse it with: every read and write here is staff
 * work, authorised by `requireStaffAccess`, and scoped by an explicit business id rather than row-level security.
 */
export function getStaffDb(): Database {
  holder.firstfoldAdminDb ??= createDatabase(serverEnv().DATABASE_URL_STAFF).db;
  return holder.firstfoldAdminDb;
}
