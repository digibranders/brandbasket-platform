"use server";

import { approveDeliverables, DeliverableError, withTenantScope } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireBillingAccess } from "@/lib/server/billing";
import { getAppDb } from "@/lib/server/db";

const MAX_IDS = 50;
const idsSchema = z.array(z.uuid()).min(1).max(MAX_IDS);

/**
 * "Approve" on the posts the customer was shown. The business and the person come from the session, never from the form:
 * the form names only the posts, and the database function approves those that are posts of this business awaiting
 * approval. Fewer approved than shown means some changed since the page loaded, which the page says in plain words.
 */
export async function approvePostsAction(formData: FormData): Promise<void> {
  const { tenant } = await requireBillingAccess();
  const parsed = idsSchema.safeParse([...new Set(formData.getAll("ids"))]);
  if (!parsed.success) redirect("/social?notice=failed");
  const ids = parsed.data;
  let notice: "approved" | "changed" | "failed";
  try {
    const approved = await withTenantScope(getAppDb(), tenant, (tx) => approveDeliverables(tx, ids));
    notice = approved === ids.length ? "approved" : "changed";
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DeliverableError && error.code === "not_found") notFound();
    console.error("[social] could not approve posts", errorLogInfo(error));
    notice = "failed";
  }
  revalidatePath("/social");
  revalidatePath("/");
  redirect(`/social?notice=${notice}`);
}
