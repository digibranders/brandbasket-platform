"use server";

import { revalidatePath } from "next/cache";
import { recordStaffAction } from "@/lib/server/activity";
import { resendAllFailed } from "@/lib/server/deliveries";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

/**
 * Today's bulk "Send again": the same work, limits and records as the Deliveries page's `resendAllFailedAction`, but it hands the
 * counts back instead of redirecting, so the bulk bar can say how many went and how many did not.
 */
export async function resendAllFailedFromTodayAction(): Promise<{ readonly sent: number; readonly failed: number }> {
  const granted = await requireStaffAccess();
  const { sent, failed } = await resendAllFailed(new Date());
  await logStaffAccess({ staffUserId: granted.user.id, action: "email.resend", targetType: "all-failed", detail: `${sent} sent, ${failed} not sent` });
  await recordStaffAction(granted, { businessId: null, kind: "delivery.resend_all", summary: `Sent failed deliveries again: ${sent} went, ${failed} did not` });
  revalidatePath("/deliveries");
  revalidatePath("/");
  return { sent, failed };
}
