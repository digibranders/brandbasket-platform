import "server-only";

/** The moved code reads the session through this app's own reader (src/lib/session.ts), so there is one auth instance. */
export { getSessionUser } from "@/lib/session";
