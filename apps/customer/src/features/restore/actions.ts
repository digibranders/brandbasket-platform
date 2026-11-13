"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { requireSignedIn } from "@/lib/guards";
import { startKeepPlanFor } from "../checkout/server/keep-plan";
import { findClosingAccount, restoreAccountFor } from "./server";

/*
 * Ported from apps/platform app/app-host/restore-account/actions.ts. Only the signed-in account's own closure is ever touched;
 * an account that is not closing is sent to sign in. Neither reads anything from the form.
 */

/** Brings a closing account back, then Home. */
export async function restoreAccountAction(): Promise<ActionResult> {
  await requireSignedIn();
  const closing = await findClosingAccount();
  if (closing === null) redirect("/login");
  await restoreAccountFor(closing.user.id, new Date());
  redirect("/");
}

/**
 * Keep my plan: opens the checkout for a new mandate that carries the cancelled plan on. The account stays closing until the
 * provider confirms it, so a checkout left unfinished changes nothing. A refusal comes back to the page as `?keep=` (shares the
 * checkout rate limit of 10 an hour per business).
 */
export async function keepPlanAction(): Promise<ActionResult> {
  await requireSignedIn();
  const closing = await findClosingAccount();
  if (closing === null) redirect("/login");
  const outcome = await startKeepPlanFor(closing.user, new Date());
  redirect(outcome.kind === "redirect" ? outcome.url : `/restore-account?keep=${outcome.reason}`);
}
