"use server";

import {
  PauseReasonInvalidError,
  ProjectCannotBePausedError,
  ProjectCannotStartBuildingError,
  ProjectNotPausedError,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseHoldForm, websiteMoveHref, type WebsiteMoveNotice } from "@/lib/website-form";
import { getStaffDb } from "@/lib/server/db";
import { takePreviewPicture } from "@/lib/server/project-preview";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { loadWebsiteBuild } from "@/lib/server/website-build";
import { putOnHold, resumeBuilding, startBuilding } from "@/lib/server/website-moves";

const idSchema = z.uuid();

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The business must be a valid id.");
  return parsed.data;
}

function finish(businessId: string, notice: WebsiteMoveNotice): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(websiteMoveHref(businessId, notice));
}

/** The notice for a move the database refused, or null for an error that is not a refusal. */
function refusalNotice(error: unknown): WebsiteMoveNotice | null {
  if (error instanceof PauseReasonInvalidError) return "invalid";
  if (error instanceof ProjectCannotStartBuildingError || error instanceof ProjectCannotBePausedError || error instanceof ProjectNotPausedError) {
    return "not-allowed";
  }
  return null;
}

/** Runs a move. Returns the notice when it was refused, so the caller redirects outside this catch. */
async function attempt(move: () => Promise<void>): Promise<WebsiteMoveNotice | null> {
  try {
    await move();
    return null;
  } catch (error) {
    const notice = refusalNotice(error);
    if (notice === null) throw error;
    return notice;
  }
}

async function logAndFinish(staffUserId: string, businessId: string, action: string, notice: WebsiteMoveNotice): Promise<never> {
  await logStaffAccessOrThrow({ staffUserId, action, targetType: "business", targetId: businessId, businessId });
  return finish(businessId, notice);
}

/** Staff start the work on a project that was sent to us. */
export async function startBuildingAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const refused = await attempt(() => startBuilding(getStaffDb(), { businessId, staffId: user.id }, new Date()));
  if (refused !== null) finish(businessId, refused);
  await logAndFinish(user.id, businessId, "website.building", "building");
}

/** Staff pause the build with a reason the customer reads exactly as typed. */
export async function putOnHoldAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const hold = parseHoldForm(formData.get("reason"));
  if (!hold.success) finish(businessId, "invalid");
  const refused = await attempt(() => putOnHold(getStaffDb(), { businessId, staffId: user.id, reason: hold.reason }, new Date()));
  if (refused !== null) finish(businessId, refused);
  await logAndFinish(user.id, businessId, "website.hold", "paused");
}

/** Staff take a paused build back to the stage before the pause. */
export async function resumeBuildingAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const refused = await attempt(() => resumeBuilding(getStaffDb(), { businessId, staffId: user.id }, new Date()));
  if (refused !== null) finish(businessId, refused);
  await logAndFinish(user.id, businessId, "website.resume", "resumed");
}

/** Staff take the picture of this business's current preview link again. */
export async function retakePreviewPictureAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const { project } = await loadWebsiteBuild(businessId, user.id);
  if (project === null || project.previewUrl === null) finish(businessId, "picture-failed");
  const taken = await takePreviewPicture(getStaffDb(), { projectId: project.id, businessId, previewUrl: project.previewUrl });
  await logAndFinish(user.id, businessId, "website.picture", taken ? "picture-taken" : "picture-failed");
}
