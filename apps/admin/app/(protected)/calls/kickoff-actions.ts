"use server";

import { clearUnheldKickoffBooking } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { completeKickoff } from "@/lib/server/kickoff-complete";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();
/** What was agreed on the call: the database keeps a summary to 3 to 600 characters. */
const notesSchema = z.string().trim().min(3, "Notes must be 3 to 600 characters.").max(600, "Notes must be 3 to 600 characters.");

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The kickoff call's business must be a valid id.");
  return parsed.data;
}

/**
 * The kickoff call happened: staff write what was agreed (or press "No notes needed"), the call is marked held and the
 * customer's website build is ready to start, 48 hours before the first preview is due. Notes are optional.
 */
export async function completeKickoffAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const raw = formData.get("notes");
  const text = typeof raw === "string" ? raw.trim() : "";
  const notes = text === "" ? null : notesSchema.parse(text);
  const { newlyHeld } = await completeKickoff(getStaffDb(), { businessId, staffId: user.id, now: new Date(), notes });
  if (newlyHeld) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.held", targetType: "business", targetId: businessId, businessId });
  revalidatePath("/calls");
  revalidatePath(`/clients/${businessId}`);
}

/** The kickoff did not happen: the booking is forgotten, so the customer is asked to pick a new time. A held call is never forgotten. */
export async function kickoffDidNotHappenAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const removed = await clearUnheldKickoffBooking(getStaffDb(), businessId);
  if (removed) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.no_show", targetType: "business", targetId: businessId, businessId });
  revalidatePath("/calls");
  revalidatePath(`/clients/${businessId}`);
}
