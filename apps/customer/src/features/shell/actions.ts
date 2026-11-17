"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { markNotificationRead, markNotificationsSeen, withTenantScope } from "@brandbasket/db";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
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

const notificationIdSchema = z.string().uuid();

/** One notice in the bell was opened: it stops counting as new. The person and business come from the session, so another person's id changes nothing. */
export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const customer = await requireCustomer();
  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) return actionFail("We could not find that notification.");
  try {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => markNotificationRead(tx, customer.user.id, parsed.data));
    return actionOk();
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "shell.notifications.read" });
    return actionFail("We could not mark that notification as read. It will show as new until you open it again.");
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
