"use server";

import { clearSetupCallHeld } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { completeKickoff } from "@/lib/server/kickoff-complete";
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
  redirect(`/clients/${businessId}/project#kickoff-call`);
}

/**
 * Staff mark the kickoff call as held, for a call that happened by phone or to start the build before the call's end time passes
 * (a booked call completes by itself once it ends). It also readies a Managed Website project to build.
 */
export async function markCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const { newlyHeld } = await completeKickoff(getStaffDb(), { businessId, staffId: user.id, now: new Date(), notes: null });
  if (newlyHeld) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.held", targetType: "business", targetId: businessId, businessId });
  finish(businessId);
}

/** Undo the mark, if it was a mistake. A project that already moved to building stays where it is. */
export async function undoCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const cleared = await clearSetupCallHeld(getStaffDb(), businessId, new Date());
  if (cleared) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.unheld", targetType: "business", targetId: businessId, businessId });
  finish(businessId);
}
