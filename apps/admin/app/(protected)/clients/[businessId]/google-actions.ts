"use server";

import { detachGoogle, provisionGoogleAgain, retryGoogleVerification } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageGoogle } from "@/lib/google-card";
import { googleNoticeHref, type GoogleNotice } from "@/lib/google-card-notices";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { NO_ACCESS_PATH } from "@/lib/server/staff-role";
import { logStaffAccess } from "@/lib/server/staff-access-log";

/*
 * What staff can do from a client's Google card. Each action only changes report_sources rows on the staff connection; the go
 * live job (apps/platform/lib/google-provision.ts) acts on them in its next pass, at most 15 minutes later.
 */

const idSchema = z.uuid();

/** Staff access first, then a role that may manage Google: support staff see the card but are sent away from its actions, and the refusal is logged. */
async function requireGoogleManager(): Promise<GrantedStaff> {
  const granted = await requireStaffAccess();
  if (canManageGoogle(granted.staff.role)) return granted;
  await logStaffAccess({ staffUserId: granted.user.id, action: "access.denied", targetType: "google", result: "denied" });
  return redirect(NO_ACCESS_PATH);
}

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The Google card's business must be a valid id.");
  return parsed.data;
}

function finish(businessId: string, notice: GoogleNotice): never {
  revalidatePath("/");
  revalidatePath(`/clients/${businessId}/website`);
  redirect(googleNoticeHref(businessId, notice));
}

/** Clears the 30 minute wait on a site that is not verified yet, so the next job pass asks Google again. */
export async function retryGoogleVerificationAction(formData: FormData): Promise<void> {
  const staff = await requireGoogleManager();
  const businessId = readBusinessId(formData);
  if (!(await retryGoogleVerification(getStaffDb(), businessId, new Date()))) finish(businessId, "retry-nothing");
  await recordStaffAction(staff, { businessId, kind: "google.verification_retried", summary: "Asked the go-live job to check Google verification again", visibleToClient: false });
  finish(businessId, "retry-asked");
}

/** Takes the client out of Google. History stays, and the job skips the site until someone provisions it again. Needs the ticked confirmation. */
export async function detachGoogleAction(formData: FormData): Promise<void> {
  const staff = await requireGoogleManager();
  const businessId = readBusinessId(formData);
  if (formData.get("confirm") !== "yes") finish(businessId, "detach-confirm");
  if ((await detachGoogle(getStaffDb(), businessId, new Date())) === 0) finish(businessId, "detach-nothing");
  await recordStaffAction(staff, { businessId, kind: "google.detached", summary: "Detached the client from Google", visibleToClient: false });
  finish(businessId, "detached");
}

/** Undoes a detach: the removed rows go back to waiting and the job picks the site up again. */
export async function provisionGoogleAction(formData: FormData): Promise<void> {
  const staff = await requireGoogleManager();
  const businessId = readBusinessId(formData);
  if ((await provisionGoogleAgain(getStaffDb(), businessId, new Date())) === 0) finish(businessId, "provision-nothing");
  await recordStaffAction(staff, { businessId, kind: "google.provisioned", summary: "Put the client back in the go-live queue for Google", visibleToClient: false });
  finish(businessId, "provisioned");
}
