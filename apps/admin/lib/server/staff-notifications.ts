import "server-only";
import { listStaffNotifications } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { staffBellView, type StaffBellView } from "../staff-bell";
import { getStaffDb } from "./db";

/** The console bell's notices. When they cannot be read the failure is logged and the bell shows empty: the page still opens. */
export async function readStaffBell(): Promise<StaffBellView> {
  try {
    return staffBellView(await listStaffNotifications(getStaffDb()));
  } catch (error) {
    console.error("[staff-bell] could not read the notifications", errorLogInfo(error));
    return { items: [], unread: 0 };
  }
}
