"use server";

import { addActivityEvent, removeActivityEvent } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { occurredAtFor, parseUpdateForm } from "@/lib/updates-form";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

function readId(formData: FormData, name: "id" | "businessId"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error(`The update's ${name === "id" ? "update" : "business"} must be a valid id.`);
  return parsed.data;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function finish(businessId: string, notice: "added" | "removed" | "invalid"): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}?updates=${notice}#updates`);
}

/** Staff add a dated line that appears under What we did on the customer's Overview. */
export async function addUpdateAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const todayIndia = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const parsed = parseUpdateForm(
    { service: readText(formData, "service"), title: readText(formData, "title"), date: readText(formData, "date") },
    todayIndia,
  );
  if (!parsed.success) finish(businessId, "invalid");
  const { service, title, occurredOn } = parsed.data;
  await addActivityEvent(getStaffDb(), { businessId, service, title, occurredAt: occurredAtFor(occurredOn), staffId: user.id });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "activity.add", targetType: "business", targetId: businessId, businessId });
  finish(businessId, "added");
}

/** Remove one line, only if it belongs to the given business. */
export async function removeUpdateAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const id = readId(formData, "id");
  const businessId = readId(formData, "businessId");
  await removeActivityEvent(getStaffDb(), { id, businessId });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "activity.remove", targetType: "business", targetId: businessId, businessId });
  finish(businessId, "removed");
}
