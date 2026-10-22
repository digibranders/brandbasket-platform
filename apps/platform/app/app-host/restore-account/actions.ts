"use server";

import { redirect } from "next/navigation";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { restoreAccountFor } from "@/lib/server/account-exit";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { startKeepPlanFor } from "@/lib/server/keep-plan";

/** Brings a closing account back. Only the signed-in account's own closure is ever touched. */
export async function restoreAccount(): Promise<void> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/login");
  await restoreAccountFor(access.user.id, new Date());
  redirect("/");
}

/**
 * Keep my plan: opens the checkout for a new mandate that carries the cancelled plan on. The account stays closing until
 * the provider confirms it, so a checkout left unfinished changes nothing; a refusal comes back to the page as `?keep=`.
 */
export async function keepPlan(): Promise<void> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/login");
  const outcome = await startKeepPlanFor(access.user, new Date());
  redirect(outcome.kind === "redirect" ? outcome.url : `${RESTORE_ACCOUNT_PATH}?keep=${outcome.reason}`);
}
