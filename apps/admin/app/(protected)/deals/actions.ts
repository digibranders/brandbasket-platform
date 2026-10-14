"use server";

import { InvalidDirectoryDealError, takeDownDirectoryDeal } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

const dealIdSchema = z.uuid();

/** Takes a deal off the website, with the reason its owner will read. */
export async function takeDownDealAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const dealId = dealIdSchema.safeParse(formData.get("dealId"));
  const reason = formData.get("reason");
  if (!dealId.success || typeof reason !== "string") redirect("/deals?notice=invalid");
  try {
    const done = await takeDownDirectoryDeal(getStaffDb(), { dealId: dealId.data, staffId: user.id, reason, now: new Date() });
    revalidatePath("/deals");
    redirect(`/deals?notice=${done ? "taken-down" : "unchanged"}`);
  } catch (error) {
    if (error instanceof InvalidDirectoryDealError) redirect("/deals?notice=invalid");
    throw error;
  }
}
