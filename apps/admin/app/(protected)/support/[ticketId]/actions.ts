"use server";

import { appendSupportMessageByStaff, linkSupportTicketError, unlinkSupportTicketError, updateSupportTicketByStaff } from "@firstfold/db";
import { revalidatePath } from "next/cache";
import { getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { createStaffSupportActions } from "@/lib/server/support-admin-actions";
import type { StaffSupportActionState } from "@/lib/support-admin-state";

const actions = createStaffSupportActions({
  requireStaff: requireStaffAccess,
  updateTicket: (input) => updateSupportTicketByStaff(getStaffDb(), input),
  appendMessage: (input) => appendSupportMessageByStaff(getStaffDb(), input),
  linkError: (input) => linkSupportTicketError(getStaffDb(), input),
  unlinkError: (input) => unlinkSupportTicketError(getStaffDb(), input),
  revalidate: (ticketId) => { revalidatePath("/support"); revalidatePath(`/support/${ticketId}`); },
  reportUnexpected: (error, route, userId) => reportServerError(error, { app: "admin", operation: "server_action", route, userId }),
});

export async function updateTicket(ticketId: string, _previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> { return actions.update(ticketId, form); }
export async function addMessage(ticketId: string, _previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> { return actions.message(ticketId, form); }
export async function linkError(ticketId: string, _previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> { return actions.link(ticketId, form, false); }
export async function unlinkError(ticketId: string, _previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> { return actions.link(ticketId, form, true); }
