import "server-only";
import { createGetSessionUser } from "@fynix/shared/server/session";
import { getAuth } from "./auth";

/** This app's session reader. The logic is shared; only the auth instance below is this app's own. */
export const getSessionUser = createGetSessionUser(getAuth);
