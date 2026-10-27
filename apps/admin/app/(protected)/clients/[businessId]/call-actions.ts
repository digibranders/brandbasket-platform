"use server";

import { clearTeamCallHeld, markTeamCallHeld, saveSetupCallSummary, saveTeamCallSummary } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readSummary, type CallsNotice } from "@/lib/call-form";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

function readId(formData: FormData, name: "businessId" | "callId"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error(`The call's ${name === "callId" ? "call" : "business"} must be a valid id.`);
  return parsed.data;
}

function finish(businessId: string, notice: CallsNotice): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}?calls=${notice}#calls`);
}

/** Staff mark a call after the kickoff as held. It must have started. */
export async function markTeamCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const id = readId(formData, "callId");
  const marked = await markTeamCallHeld(getStaffDb(), { id, businessId, staffId: user.id, now: new Date() });
  if (marked) await logStaffAccessOrThrow({ staffUserId: user.id, action: "team_call.held", targetType: "team_call", targetId: id, businessId });
  finish(businessId, marked ? "held" : "gone");
}

/** Undo the mark, if it was a mistake. What was agreed on the call goes with it. */
export async function undoTeamCallHeldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const id = readId(formData, "callId");
  const cleared = await clearTeamCallHeld(getStaffDb(), { id, businessId, now: new Date() });
  if (cleared) await logStaffAccessOrThrow({ staffUserId: user.id, action: "team_call.unheld", targetType: "team_call", targetId: id, businessId });
  finish(businessId, cleared ? "undone" : "gone");
}

/**
 * Staff write what was agreed on a held call, or clear it with an empty box. The customer reads it on their Calls page. The
 * kickoff call's summary is saved here too; its form sends `callId=kickoff`.
 */
export async function saveCallSummaryAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const kickoff = formData.get("callId") === "kickoff";
  const id = kickoff ? null : readId(formData, "callId");
  const read = readSummary(formData.get("summary"));
  if (!read.ok) finish(businessId, "invalid");
  const now = new Date();
  const saved =
    id === null
      ? await saveSetupCallSummary(getStaffDb(), { businessId, staffId: user.id, summary: read.summary, now })
      : await saveTeamCallSummary(getStaffDb(), { id, businessId, staffId: user.id, summary: read.summary, now });
  if (saved) {
    await logStaffAccessOrThrow({
      staffUserId: user.id,
      action: "call.summary",
      targetType: id === null ? "business" : "team_call",
      targetId: id ?? businessId,
      businessId,
    });
  }
  finish(businessId, saved ? (read.summary === null ? "cleared" : "saved") : "gone");
}
