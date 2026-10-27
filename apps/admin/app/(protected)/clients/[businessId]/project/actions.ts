"use server";

import {
  assignProjectBuilder,
  cancelProject,
  grantRevisionRound,
  ProjectBuilderNotStaffError,
  ProjectMoveRefusedError,
  type MovedProject,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { projectMoveNoticeHref, type ProjectMoveNotice } from "@/lib/project-move-notices";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

const idSchema = z.uuid();

function readId(value: FormDataEntryValue | null, what: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${what} must be a valid id.`);
  return parsed.data;
}

function readIds(formData: FormData): { readonly businessId: string; readonly projectId: string } {
  return { businessId: readId(formData.get("businessId"), "The business"), projectId: readId(formData.get("projectId"), "The project") };
}

function finish(businessId: string, notice: ProjectMoveNotice): never {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/clients/${businessId}`);
  revalidatePath(`/clients/${businessId}/project`);
  redirect(projectMoveNoticeHref(businessId, notice));
}

/** Runs a move; a refusal from the database becomes a notice instead of an error page. */
async function attempt(businessId: string, move: () => Promise<MovedProject>): Promise<MovedProject> {
  try {
    return await move();
  } catch (error) {
    if (error instanceof ProjectMoveRefusedError) finish(businessId, "refused");
    if (error instanceof ProjectBuilderNotStaffError) finish(businessId, "not-staff");
    throw error;
  }
}

export async function cancelProjectAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { businessId, projectId } = readIds(formData);
  if (formData.get("confirm") !== "yes") finish(businessId, "confirm-missing");
  await attempt(businessId, () => cancelProject(getStaffDb(), projectId));
  await recordStaffAction(staff, { businessId, kind: "project.cancelled", summary: "Build cancelled", visibleToClient: false });
  finish(businessId, "cancelled");
}

export async function assignBuilderAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { businessId, projectId } = readIds(formData);
  const raw = formData.get("builder");
  const builder = typeof raw === "string" && raw !== "" ? raw : null;
  await attempt(businessId, () => assignProjectBuilder(getStaffDb(), projectId, builder));
  await recordStaffAction(staff, { businessId, kind: "project.builder_set", summary: builder === null ? "Builder cleared" : "Builder changed", data: { builderId: builder } });
  finish(businessId, "assigned");
}

export async function grantRoundAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { businessId, projectId } = readIds(formData);
  await attempt(businessId, () => grantRevisionRound(getStaffDb(), projectId));
  await recordStaffAction(staff, { businessId, kind: "project.round_added", summary: "One more round of changes added", visibleToClient: true });
  finish(businessId, "round-added");
}
