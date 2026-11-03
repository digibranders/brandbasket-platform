import "server-only";

/*
 * The app's connections, re-exported so checkout's server modules (and their tests' mocks) name one module, as the old
 * lib/server/*.ts did with "./db". The staff connection's uses here are the billing writes customers never make directly:
 * see the sanctioned list in src/lib/db.ts.
 */
export { getAppDb, getStaffDb } from "@/lib/db";
