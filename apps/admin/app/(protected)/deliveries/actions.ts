"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordStaffAction } from "@/lib/server/activity";
import { resendAllFailed, resendEmail } from "@/lib/server/deliveries";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendFailedAlert } from "@/lib/server/teams-admin";

function readDeliveryId(value: FormDataEntryValue | null): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error("Missing delivery id");
  return parsed.data;
}

function fromDetail(value: FormDataEntryValue | null): boolean {
  return value === "detail";
}

export async function resendEmailAction(formData: FormData): Promise<void> {
  const granted = await requireStaffAccess();
  const id = readDeliveryId(formData.get("deliveryId"));
  const result = await resendEmail(id, new Date());
  await logStaffAccess({ staffUserId: granted.user.id, action: "email.resend", targetType: "email", targetId: id, result: result === "sent" ? "ok" : "failed" });
  await recordStaffAction(granted, { businessId: null, kind: "email.resend", summary: result === "sent" ? "Sent an email again" : "Tried to send an email again" });
  revalidatePath("/deliveries");
  redirect(fromDetail(formData.get("from")) ? `/outbox/${id}?resent=${result}` : `/deliveries?resent=${result}`);
}

export async function resendAlertAction(formData: FormData): Promise<void> {
  const granted = await requireStaffAccess();
  const id = readDeliveryId(formData.get("deliveryId"));
  const result = await resendFailedAlert(id, new Date());
  await logStaffAccess({ staffUserId: granted.user.id, action: "alert.resend", targetType: "alert", targetId: id, result: result === "sent" ? "ok" : "failed" });
  await recordStaffAction(granted, { businessId: null, kind: "alert.resend", summary: result === "sent" ? "Sent a Teams alert again" : "Tried to send a Teams alert again" });
  revalidatePath("/deliveries");
  redirect(fromDetail(formData.get("from")) ? `/deliveries/${id}?resent=${result}` : `/deliveries?resent=${result}`);
}

export async function resendAllFailedAction(): Promise<void> {
  const granted = await requireStaffAccess();
  const { sent, failed } = await resendAllFailed(new Date());
  await logStaffAccess({ staffUserId: granted.user.id, action: "email.resend", targetType: "all-failed", detail: `${sent} sent, ${failed} not sent` });
  await recordStaffAction(granted, { businessId: null, kind: "delivery.resend_all", summary: `Sent failed deliveries again: ${sent} went, ${failed} did not` });
  revalidatePath("/deliveries");
  redirect(`/deliveries?resentAll=${sent}-${failed}`);
}
