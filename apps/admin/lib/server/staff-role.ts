import "server-only";
import { staffCan, type StaffCapability } from "@fynix/shared/lib/access";
import { redirect } from "next/navigation";
import { requireStaffAccess, type GrantedStaff } from "./staff-access";
import { logStaffAccess } from "./staff-access-log";

/** Where a staff member is sent when their role does not allow what they asked for. */
export const NO_ACCESS_PATH = "/no-access";

/**
 * Like `requireStaffAccess`, and also checks that this staff member's role allows `capability` (see STAFF_CAPABILITIES).
 * Call it first in a page or action that moves money or shows what other staff did. A refusal is recorded in the
 * access log, then the staff member is sent to a plain page that says so: the work is never started.
 */
export async function requireStaffCan(capability: StaffCapability): Promise<GrantedStaff> {
  const granted = await requireStaffAccess();
  if (staffCan(granted.staff.role, capability)) return granted;
  await logStaffAccess({ staffUserId: granted.user.id, action: "access.denied", targetType: capability, result: "denied" });
  return redirect(NO_ACCESS_PATH);
}
