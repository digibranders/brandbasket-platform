import "server-only";
import { recordActivity } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { getStaffDb } from "./db";
import type { GrantedStaff } from "./staff-access";

export interface StaffActionEntry {
  readonly businessId: string | null;
  /** A dotted name, such as "lead.status_changed" or "project.put_on_hold". */
  readonly kind: string;
  /** Written by code, such as "Put on hold: waiting for photos". Never copy customer text into it. */
  readonly summary: string;
  readonly data?: Record<string, unknown>;
  readonly visibleToClient?: boolean;
}

/** Records what a staff member changed. Never throws: a failed write is logged and the action's result stands. */
export async function recordStaffAction(staff: GrantedStaff, entry: StaffActionEntry): Promise<void> {
  try {
    await recordActivity(getStaffDb(), {
      businessId: entry.businessId,
      actorKind: "staff",
      actorId: staff.user.id,
      kind: entry.kind,
      summary: entry.summary,
      data: entry.data,
      visibleToClient: entry.visibleToClient,
    });
  } catch (error) {
    console.error("A staff action could not be recorded.", { kind: entry.kind, ...errorLogInfo(error) });
  }
}
