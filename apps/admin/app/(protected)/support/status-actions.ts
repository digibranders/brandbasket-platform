"use server";

import { getSupportTicketForStaff, updateSupportTicketByStaff } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { createTicketStatusActions, type TicketStatusResult } from "@/lib/server/ticket-status-actions";

const actions = createTicketStatusActions({
  requireStaff: requireStaffAccess,
  readTicket: async (ticketId) => {
    const detail = await getSupportTicketForStaff(getStaffDb(), ticketId);
    return detail === null ? null : { status: detail.ticket.status, version: detail.ticket.version };
  },
  updateTicket: (input) => updateSupportTicketByStaff(getStaffDb(), input),
  revalidate: (ticketId) => {
    revalidatePath("/support");
    revalidatePath(`/support/${ticketId}`);
  },
  reportUnexpected: (error, route, userId) => reportServerError(error, { app: "admin", operation: "server_action", route, userId }),
});

export async function closeTicketAction(ticketId: string): Promise<TicketStatusResult> {
  return actions.close(ticketId);
}
export async function reopenTicketAction(ticketId: string): Promise<TicketStatusResult> {
  return actions.reopen(ticketId);
}
export async function restoreTicketStatusAction(ticketId: string, to: string): Promise<TicketStatusResult> {
  return actions.restore(ticketId, to);
}
