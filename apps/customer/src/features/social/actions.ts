"use server";

import { approveDeliverables, DeliverableError, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { requireService } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { approvalOutcome, approveIdsSchema, APPROVAL_NOTICES, VIEWER_MESSAGE, type ApprovalOutcome } from "./rules";

export interface ApprovedPosts {
  readonly outcome: ApprovalOutcome;
  readonly approved: number;
}

/**
 * "Approve" on the posts the customer was shown. The business and the person come from the session, never from the browser:
 * it names only the posts, and the database function approves those that are posts of this business awaiting approval,
 * which is also what makes a second press harmless. Fewer approved than shown means some changed since the page loaded.
 * Writes the same record the old app wrote (approve_deliverables).
 */
export async function approvePostsAction(ids: readonly string[]): Promise<ActionResult<ApprovedPosts>> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = approveIdsSchema.safeParse(ids);
  if (!parsed.success) return actionFail(parsed.error.issues[0]?.message ?? APPROVAL_NOTICES.failed.text);
  const requested = parsed.data;
  let approved: number;
  try {
    approved = await withTenantScope(getAppDb(), customer.tenant, (tx) => approveDeliverables(tx, requested));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DeliverableError && error.code === "not_found") return actionFail("We could not find those posts.");
    reportError(error, { area: "social.approve" });
    return actionFail(APPROVAL_NOTICES.failed.text);
  }
  revalidatePath("/social", "layout");
  revalidatePath("/");
  return actionOk({ outcome: approvalOutcome(approved, requested.length), approved });
}
