import "server-only";
import { createGetSessionUser } from "@brandbasket/shared/server/session";
import { getAuth } from "./auth";

/** The signed-in user for this request, or null. Read once per request (React cache), refresh disabled. */
export const getSessionUser = createGetSessionUser(getAuth);
