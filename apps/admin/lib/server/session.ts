import "server-only";
import { createGetSessionUser } from "@brandbasket/shared/server/session";
import { getAuth } from "./auth";

/**
 * This app's session reader. The logic is shared; only the auth instance below is this app's own. A session counts only
 * if it passed the emailed code (lib/server/sign-in.ts).
 */
export const getSessionUser = createGetSessionUser(getAuth, { requireSecondFactor: true });
