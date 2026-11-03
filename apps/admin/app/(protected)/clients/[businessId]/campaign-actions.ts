"use server";

import { addAdCampaign, removeAdCampaign, updateAdCampaign } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCampaignForm, parseCampaignMonth } from "@/lib/ad-campaign-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

export type CampaignNotice = "saved" | "removed" | "invalid" | "duplicate" | "not-bought" | "not-found";

function finish(businessId: string, notice: CampaignNotice): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}/billing?campaigns=${notice}#campaigns`);
}

function readId(formData: FormData, name: "id" | "businessId"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error(`The campaign's ${name === "id" ? "campaign" : "business"} must be a valid id.`);
  return parsed.data;
}

function textFields(formData: FormData): Record<string, string> {
  const text: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string") text[name] = value;
  return text;
}

/**
 * Staff add one ad campaign's month for a customer who bought Social & Ads, or, with an `id`, correct one in place (its
 * month stays). A second campaign with the same name in a month is refused.
 */
export async function saveCampaignAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const editingId = formData.get("id") === null || formData.get("id") === "" ? null : readId(formData, "id");
  const text = textFields(formData);
  const parsed = parseCampaignForm(text);
  if (!parsed.success) finish(businessId, "invalid");

  const db = getStaffDb();
  if (editingId !== null) {
    const result = await updateAdCampaign(db, { id: editingId, businessId, figures: parsed.data, staffId: user.id, now: new Date() });
    if (result === "saved") await logStaffAccessOrThrow({ staffUserId: user.id, action: "campaign.update", targetType: "business", targetId: businessId, businessId });
    finish(businessId, result);
  }

  const month = parseCampaignMonth(text["month"] ?? "", new Date());
  if (month === null) finish(businessId, "invalid");
  if (!(await listBoughtServices(db, businessId)).includes("social")) finish(businessId, "not-bought");
  const result = await addAdCampaign(db, { businessId, month, figures: parsed.data, staffId: user.id });
  if (result === "saved") await logStaffAccessOrThrow({ staffUserId: user.id, action: "campaign.add", targetType: "business", targetId: businessId, businessId });
  finish(businessId, result);
}

/** Remove one campaign, only if it belongs to the given business. */
export async function removeCampaignAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const id = readId(formData, "id");
  const businessId = readId(formData, "businessId");
  const removed = await removeAdCampaign(getStaffDb(), { id, businessId });
  if (removed) await logStaffAccessOrThrow({ staffUserId: user.id, action: "campaign.remove", targetType: "business", targetId: businessId, businessId });
  finish(businessId, removed ? "removed" : "not-found");
}
