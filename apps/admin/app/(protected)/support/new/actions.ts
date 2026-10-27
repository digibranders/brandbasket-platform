"use server";

import { createSupportTicketByStaff } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { createOpenRequestAction, emailRequestOwner } from "@/lib/server/staff-opened-request";
import type { StaffSupportActionState } from "@/lib/support-admin-state";

const open = createOpenRequestAction({
  requireStaff: requireStaffAccess,
  createTicket: (input) => createSupportTicketByStaff(getStaffDb(), input),
  emailOwner: (input) => emailRequestOwner(getStaffDb(), input),
  recordAction: recordStaffAction,
  revalidate: (ticketId) => {
    revalidatePath("/support");
    revalidatePath(`/support/${ticketId}`);
  },
  reportUnexpected: (error, userId) => reportServerError(error, { app: "admin", operation: "server_action", route: "/support/new", userId }),
});

/** Opens the request, then goes to it; the request page shows what happened to the owner's email. */
export async function openRequestForClient(_previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> {
  const result = await open(form);
  if (result.kind === "saved" && result.ticketId !== undefined && result.openedOutcome !== undefined) {
    redirect(`/support/${result.ticketId}?opened=${result.openedOutcome}`);
  }
  return result;
}
