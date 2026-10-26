"use server";

import { clearSetupCallHeld, markSetupCallHeld } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The kickoff call's business must be a valid id.");
  return parsed.data;
}

function finish(businessId: string): never {
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/clients");
  redirect(`/clients/${businessId}#kickoff-call`);
}

/** Staff mark the kickoff call as held: it ends the customer's first look and opens their To do page and Overview. */
export async function markCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  await markSetupCallHeld(getStaffDb(), { businessId, staffId: user.id, now: new Date() });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.held", targetType: "business", targetId: businessId, businessId });
  finish(businessId);
}

/** Undo the mark, if it was a mistake: the customer goes back to the first look. */
export async function undoCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  await clearSetupCallHeld(getStaffDb(), businessId, new Date());
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.unheld", targetType: "business", targetId: businessId, businessId });
  finish(businessId);
}
