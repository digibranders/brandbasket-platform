"use server";

import { ensureSiteKey } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

const idSchema = z.uuid();

/** Staff make the public tracking key a customer's website puts in its script tag. A second press changes nothing. */
export async function createSiteKeyAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The tracking key's business must be a valid id.");
  const businessId = parsed.data;

  await ensureSiteKey(getStaffDb(), businessId);
  await recordStaffAction(staff, { businessId, kind: "website.tracking_key_created", summary: "Created the site tracking key" });
  revalidatePath(`/clients/${businessId}`);
}
