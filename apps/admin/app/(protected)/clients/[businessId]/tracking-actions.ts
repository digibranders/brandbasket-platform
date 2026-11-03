"use server";

import { ensureSiteKey, upsertReportSource } from "@brandbasket/db";
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

const analyticsPropertySchema = z.object({
  businessId: z.uuid(),
  // A GA4 property id is digits only ("Admin, Property details"). Not the G- measurement id.
  propertyId: z.string().trim().regex(/^\d{5,15}$/, "A Google Analytics property id is 5 to 15 digits."),
});

/**
 * Staff set the Google Analytics property to pull from, once the customer has added our service account as a Viewer. It starts
 * as pending; the nightly pull marks it connected, or access lost. A second save with another id starts again as pending.
 */
export async function saveAnalyticsPropertyAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const parsed = analyticsPropertySchema.safeParse({ businessId: formData.get("businessId"), propertyId: formData.get("propertyId") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "The Google Analytics property is not valid.");
  const { businessId, propertyId } = parsed.data;

  await upsertReportSource(getStaffDb(), { businessId, source: "ga4", externalId: propertyId, now: new Date() });
  await recordStaffAction(staff, { businessId, kind: "website.analytics_property_set", summary: "Set the Google Analytics property" });
  revalidatePath(`/clients/${businessId}`);
}
