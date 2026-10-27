"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseStaffInviteForm, parseStaffRole } from "@/lib/staff-invite-form";
import type { StaffNotice } from "@/lib/staff-notices";
import { changeStaffRole, inviteStaff, resendStaffInvite, switchOffStaff, switchOnStaff } from "@/lib/server/staff-admin";
import { requireStaffCan } from "@/lib/server/staff-role";

function readId(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value !== "" && value.length <= 128 ? value : null;
}

function finish(notice: StaffNotice): never {
  revalidatePath("/staff");
  redirect(`/staff?notice=${notice}`);
}

export async function inviteStaffAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("oversight");
  const parsed = parseStaffInviteForm(formData);
  finish(parsed.ok ? await inviteStaff(granted, { email: parsed.email, role: parsed.role }) : "bad-invite");
}

export async function resendStaffInviteAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("oversight");
  const inviteId = readId(formData.get("inviteId"));
  finish(inviteId === null ? "invite-gone" : await resendStaffInvite(granted, inviteId));
}

export async function changeStaffRoleAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("oversight");
  const userId = readId(formData.get("userId"));
  const role = parseStaffRole(formData.get("role"));
  finish(userId === null || role === null ? "not-found" : await changeStaffRole(granted, userId, role));
}

export async function switchOffStaffAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("oversight");
  const userId = readId(formData.get("userId"));
  finish(userId === null ? "not-found" : await switchOffStaff(granted, userId));
}

export async function switchOnStaffAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("oversight");
  const userId = readId(formData.get("userId"));
  finish(userId === null ? "not-found" : await switchOnStaff(granted, userId));
}
