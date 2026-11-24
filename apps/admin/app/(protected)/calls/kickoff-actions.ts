"use server";

import { clearUnheldKickoffBooking, findSetupCallBooking, markKickoffPromptAnswered, markKickoffPromptsShown, recordKickoffOutcome } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { completeKickoff } from "@/lib/server/kickoff-complete";
import { noticeKickoffAnswered } from "@/lib/server/kickoff-notices";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();
/** What was agreed on the call: the database keeps a summary to 3 to 600 characters. */
const notesSchema = z.string().trim().min(3, "Notes must be 3 to 600 characters.").max(600, "Notes must be 3 to 600 characters.");
/** The three ways a kickoff call can fail to happen, as the wrap-up buttons name them. */
const noShowOutcomeSchema = z.enum(["customer_no_show", "team_no_show", "rescheduled"]);
type NoShowOutcome = z.infer<typeof noShowOutcomeSchema>;

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The kickoff call's business must be a valid id.");
  return parsed.data;
}

function readNoShowOutcome(formData: FormData): NoShowOutcome {
  return noShowOutcomeSchema.parse(formData.get("outcome"));
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
  const db = getStaffDb();
  const now = new Date();
  const { newlyHeld } = await completeKickoff(db, { businessId, staffId: user.id, now, notes });
  await markKickoffPromptAnswered(db, businessId, now);
  if (newlyHeld) {
    const booking = await findSetupCallBooking(db, businessId);
    await noticeKickoffAnswered({ answer: "completed", businessId, startsAt: booking?.startsAt ?? null });
  }
  if (newlyHeld) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.held", targetType: "business", targetId: businessId, businessId });
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/");
  // The popup lives in the layout, so every page must re-read it.
  revalidatePath("/", "layout");
}

async function recordOutcomeForBusiness(businessId: string, outcome: NoShowOutcome, staffUserId: string): Promise<void> {
  const db = getStaffDb();
  const booking = await findSetupCallBooking(db, businessId);
  const removed = await clearUnheldKickoffBooking(db, businessId);
  if (removed) {
    await recordKickoffOutcome(db, { businessId, outcome, note: null, startsAt: booking?.startsAt ?? null, endsAt: booking?.endsAt ?? null, staffId: staffUserId, now: new Date() });
    await logStaffAccessOrThrow({ staffUserId, action: `setup_call.${outcome}`, targetType: "business", targetId: businessId, businessId });
    // Their prompt state went with the booking (it cascades), so only the customer is left to tell.
    await noticeKickoffAnswered({ answer: outcome === "customer_no_show" ? "not_joined" : "reschedule", businessId, startsAt: booking?.startsAt ?? null });
  }
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/");
  revalidatePath("/", "layout");
}

/**
 * Action 2 from the kickoff prompt: They did not join.
 * The booking is forgotten so the customer is asked to pick a new time, and the customer_no_show outcome is recorded.
 */
export async function theyDidNotJoinAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  await recordOutcomeForBusiness(businessId, "customer_no_show", user.id);
}

/**
 * Action 3 from the kickoff prompt: Reschedule.
 * The booking is forgotten so the customer is asked to pick a new time, and the rescheduled outcome is recorded.
 */
export async function rescheduleKickoffAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  await recordOutcomeForBusiness(businessId, "rescheduled", user.id);
}

/**
 * The kickoff did not happen, and why: the booking is forgotten (so the customer picks a new time) and the outcome is
 * recorded with the booking's times. A completed call is never forgotten, so nothing is recorded for it either. The note is
 * always null: free text could hold personal data that erasure does not remove.
 */
export async function recordKickoffOutcomeAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const outcome = readNoShowOutcome(formData);
  await recordOutcomeForBusiness(businessId, outcome, user.id);
}

/** The kickoff did not happen: the booking is forgotten, so the customer is asked to pick a new time. A held call is never forgotten. */
export async function kickoffDidNotHappenAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const removed = await clearUnheldKickoffBooking(getStaffDb(), businessId);
  if (removed) await logStaffAccessOrThrow({ staffUserId: user.id, action: "setup_call.no_show", targetType: "business", targetId: businessId, businessId });
  revalidatePath("/");
  revalidatePath(`/clients/${businessId}`);
}

const callIdsSchema = z.array(z.uuid()).min(1).max(50);

/**
 * The popup was shown for these calls: the server notes it, so it shows again in 15 minutes whichever tab or browser staff
 * use. The ids are calls' ids (the prompt state's key), not business ids.
 */
export async function markKickoffPromptsShownAction(callIds: readonly string[]): Promise<void> {
  await requireStaffAccess();
  await markKickoffPromptsShown(getStaffDb(), callIdsSchema.parse(callIds), new Date());
}
