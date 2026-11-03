import "server-only";
import { connection } from "next/server";
import { createGetSessionUser } from "@brandbasket/shared/server/session";
import { getAuth } from "./auth";

const readSessionUser = createGetSessionUser(getAuth);
type SessionUser = Awaited<ReturnType<typeof readSessionUser>>;

/**
 * The signed-in user for this request, or null. Read once per request (React cache), refresh disabled. Waiting for the
 * request first keeps every page that reads a session out of build-time prerendering, which has no server configuration.
 */
export async function getSessionUser(): Promise<SessionUser> {
  await connection();
  return readSessionUser();
}
