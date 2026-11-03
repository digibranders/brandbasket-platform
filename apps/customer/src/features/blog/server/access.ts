import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionFailure, type ActionResult } from "@/lib/action-result";
import { requireWebsite, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { SAVE_FAILED_MESSAGE, VIEWER_MESSAGE } from "../rules/messages";
import { isDocId } from "../rules/paths";

/**
 * The guard every blog write starts with: the website is bought and a paid period is running (unpaid and lapsed are sent on
 * by the guard), and the member may write. Payload has no row-level security, so the viewer refusal here is the only check
 * between a viewer and a write.
 */
export async function blogWriter(): Promise<CustomerContext | ActionFailure> {
  const customer = await requireWebsite({ write: true });
  return customer.role === "viewer" ? actionFail(VIEWER_MESSAGE) : customer;
}

export function isRefusal(value: CustomerContext | ActionFailure): value is ActionFailure {
  return "ok" in value;
}

/** A post, author, category or image id as Payload makes them. */
export const DocId = z.string().refine(isDocId);

/** Runs one write. Next's own control flow (redirect, notFound) is rethrown; any other failure is reported and answered in words. */
export async function blogWrite<T = undefined>(area: string, work: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    return (await work()) ?? (actionOk() as ActionResult<T>);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area });
    return actionFail(SAVE_FAILED_MESSAGE);
  }
}

/** Whether to show write controls: the same rule blogWriter enforces (a member who is not a viewer, a paid period running, the website held). */
export function canWriteBlog(customer: Pick<CustomerContext, "role" | "billing">): boolean {
  return customer.role !== "viewer" && customer.billing.status === "paid" && customer.billing.hasWebsite;
}
