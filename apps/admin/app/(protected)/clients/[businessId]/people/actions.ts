"use server";

import { extendAccountClosure, renameBusinessOwner, restoreAccountClosureForBusiness } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { peopleNoticeHref } from "@/lib/people-notices";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

const idSchema = z.uuid();
/** The sign-up form's limit for a person's name. */
const ownerNameSchema = z.string().trim().min(1).max(60);
/** How far one Extend moves the erase date. */
const EXTEND_DAYS = 30;

function readBusinessId(value: FormDataEntryValue | null): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new Error("The business must be a valid id.");
  return parsed.data;
}

function refresh(businessId: string): void {
  revalidatePath("/clients");
  revalidatePath(`/clients/${businessId}`, "layout");
}

/** Corrects the name of one of the business's owners. The name is not a sign-in identity, so no proof is needed. */
export async function renameOwnerAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readBusinessId(formData.get("businessId"));
  const userId = formData.get("userId");
  const name = ownerNameSchema.safeParse(formData.get("name"));
  if (typeof userId !== "string" || userId === "" || !name.success) redirect(peopleNoticeHref(businessId, "invalid-name"));

  const renamed = await renameBusinessOwner(getStaffDb(), { businessId, userId, name: name.data });
  if (!renamed) redirect(peopleNoticeHref(businessId, "not-owner"));
  await recordStaffAction(staff, { businessId, kind: "people.owner_renamed", summary: "Changed the owner's name", data: { userId } });
  refresh(businessId);
  redirect(peopleNoticeHref(businessId, "renamed"));
}

/** Cancels a leaving account's closure, as the owner signing in would. Admins only. */
export async function restoreClosureAction(formData: FormData): Promise<void> {
  // "oversight" is the admin-only capability.
  const staff = await requireStaffCan("oversight");
  const businessId = readBusinessId(formData.get("businessId"));
  const restored = await restoreAccountClosureForBusiness(getStaffDb(), { businessId, now: new Date() });
  if (!restored) redirect(peopleNoticeHref(businessId, "no-closure"));
  await logStaffAccess({ staffUserId: staff.user.id, action: "client.closure_restore", targetType: "business", targetId: businessId, businessId });
  await recordStaffAction(staff, { businessId, kind: "account.restored", summary: "Restored the account" });
  refresh(businessId);
  redirect(peopleNoticeHref(businessId, "restored"));
}

/** Gives a leaving account 30 more days before it is erased. Admins only. */
export async function extendClosureAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("oversight");
  const businessId = readBusinessId(formData.get("businessId"));
  const extended = await extendAccountClosure(getStaffDb(), { businessId, days: EXTEND_DAYS });
  if (!extended) redirect(peopleNoticeHref(businessId, "no-closure"));
  await logStaffAccess({ staffUserId: staff.user.id, action: "client.closure_extend", targetType: "business", targetId: businessId, businessId });
  await recordStaffAction(staff, { businessId, kind: "account.erase_extended", summary: "Moved the erase date 30 days later" });
  refresh(businessId);
  redirect(peopleNoticeHref(businessId, "extended"));
}
