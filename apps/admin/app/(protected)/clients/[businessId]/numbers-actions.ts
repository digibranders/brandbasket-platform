"use server";

import { upsertMonthlySnapshot } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNumbersForm } from "@/lib/numbers-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

function finish(businessId: string, notice: "saved" | "invalid" | "not-bought"): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}?numbers=${notice}#numbers`);
}

/** Staff save one month's figures for one service the customer has bought; it replaces that month's row. */
export async function saveNumbersAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const idParsed = idSchema.safeParse(formData.get("businessId"));
  if (!idParsed.success) throw new Error("The numbers' business must be a valid id.");
  const businessId = idParsed.data;

  const text: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string") text[name] = value;
  const parsed = parseNumbersForm(text);
  if (!parsed.success) finish(businessId, "invalid");

  const db = getStaffDb();
  const { service, month, figures } = parsed.data;
  if (!(await listBoughtServices(db, businessId)).includes(service)) finish(businessId, "not-bought");

  await upsertMonthlySnapshot(db, { businessId, service, month, figures, staffId: user.id, now: new Date() });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "numbers.save", targetType: "business", targetId: businessId, businessId });
  finish(businessId, "saved");
}
