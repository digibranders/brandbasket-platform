"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { markNotificationsSeen, withTenantScope } from "@brandbasket/db";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAuth } from "@/lib/auth";
import { getAppDb } from "@/lib/db";
import { GUARD_PATHS } from "@/lib/guard-rules";
import { requireCustomer, requireSignedIn } from "@/lib/guards";
import { reportError } from "@/lib/report";

/**
 * The bell was opened: everything shown up to now is read. Takes no input, so there is nothing to validate; the person and
 * the business come from the session.
 */
export async function markNotificationsSeenAction(): Promise<ActionResult> {
  const customer = await requireCustomer();
  try {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => markNotificationsSeen(tx, customer.user.id));
    return actionOk();
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "shell.notifications.seen" });
    return actionFail("We could not mark your notifications as read. They will show as new until you open them again.");
  }
}

/** Ends this browser's session and goes to sign in. Ported from apps/platform lib/server/sign-out.ts. */
export async function signOutAction(): Promise<ActionResult> {
  await requireSignedIn();
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "shell.sign-out" });
    return actionFail("We could not sign you out. Try again.");
  }
  redirect(GUARD_PATHS.signIn);
}
