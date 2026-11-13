import "server-only";

/**
 * The moved code's database connections are this app's own (src/lib/db.ts): same DATABASE_URL and DATABASE_URL_STAFF,
 * one pool each. The staff-connection uses the moved code makes are listed in src/lib/db.ts.
 */
export { getAppDb, getStaffDb } from "@/lib/db";
