"use server";

import { removeConnectedAccount, saveConnectedAccount, CONNECTED_PLATFORMS } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseAccountForm } from "@/lib/connected-account-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();
const platformSchema = z.enum(CONNECTED_PLATFORMS);

export type AccountNotice = "saved" | "removed" | "invalid" | "not-bought" | "not-found";

function finish(businessId: string, notice: AccountNotice): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}/billing?accounts=${notice}#accounts`);
}

function readBusinessId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("businessId"));
  if (!parsed.success) throw new Error("The account's business must be a valid id.");
  return parsed.data;
}

/** Staff add or correct one of a customer's social or search accounts. Saving a platform that is already listed replaces it. */
export async function saveAccountAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const text: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string") text[name] = value;
  const parsed = parseAccountForm(text, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  if (!parsed.success) finish(businessId, "invalid");

  const db = getStaffDb();
  if ((await listBoughtServices(db, businessId)).length === 0) finish(businessId, "not-bought");
  await saveConnectedAccount(db, { businessId, ...parsed.data });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "account.save", targetType: "business", targetId: businessId, businessId });
  finish(businessId, "saved");
}

/** Remove one platform's account from the customer's list. */
export async function removeAccountAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readBusinessId(formData);
  const platform = platformSchema.safeParse(formData.get("platform"));
  if (!platform.success) finish(businessId, "invalid");
  const removed = await removeConnectedAccount(getStaffDb(), { businessId, platform: platform.data });
  if (removed) await logStaffAccessOrThrow({ staffUserId: user.id, action: "account.remove", targetType: "business", targetId: businessId, businessId });
  finish(businessId, removed ? "removed" : "not-found");
}
