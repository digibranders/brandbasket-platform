"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { markStaffNotificationRead } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { z } from "zod";
import { getStaffDb } from "./db";
import { requireStaffAccess } from "./staff-access";

const idSchema = z.string().uuid();

/** A staff notice was opened: it stops counting as new for the one staff account. Returns whether it was saved. */
export async function markStaffNotificationReadAction(notificationId: string): Promise<boolean> {
  await requireStaffAccess();
  const parsed = idSchema.safeParse(notificationId);
  if (!parsed.success) return false;
  try {
    await markStaffNotificationRead(getStaffDb(), parsed.data);
    return true;
  } catch (error) {
    console.error("[staff-bell] could not mark a notification read", errorLogInfo(error));
    return false;
  }
}
