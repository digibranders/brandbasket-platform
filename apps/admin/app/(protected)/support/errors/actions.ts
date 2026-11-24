"use server";

import { getErrorIssue, updateErrorIssueStatus } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ERROR_STATUSES, type ErrorStatusResult } from "@/lib/error-status";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

const inputSchema = z.object({ issueId: z.uuid(), status: z.enum(ERROR_STATUSES), expectedCount: z.number().int().min(1).max(2_147_483_647) });

/**
 * Sets an app error's review status. Status only: nobody is emailed and the assignee is left as it was. The occurrence
 * count the person saw guards against a newer occurrence; the same call with the previous status is the Undo.
 */
export async function setErrorStatusAction(issueId: string, status: string, expectedCount: number): Promise<ErrorStatusResult> {
  await requireStaffAccess();
  const parsed = inputSchema.safeParse({ issueId, status, expectedCount });
  if (!parsed.success) return { ok: false, message: "Choose a valid status and try again." };
  const db = getStaffDb();
  const issue = await getErrorIssue(db, parsed.data.issueId);
  if (issue === null) return { ok: false, message: "That error no longer exists." };
  const changed = await updateErrorIssueStatus(db, parsed.data.issueId, parsed.data.status, parsed.data.expectedCount);
  if (!changed) return { ok: false, message: "This error changed while you reviewed it. Reload to see the latest counts." };
  revalidatePath("/support/errors");
  revalidatePath(`/support/errors/${parsed.data.issueId}`);
  return { ok: true, previous: issue.status, occurrenceCount: parsed.data.expectedCount };
}
