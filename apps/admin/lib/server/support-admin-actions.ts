import "server-only";
import { SupportQueryError, type AppendSupportMessageByStaffInput, type UpdateSupportTicketByStaffInput, type SupportTicketErrorLinkInput } from "@firstfold/db";
import { staffSupportLinkSchema, staffSupportMessageSchema, staffSupportUpdateSchema, type StaffSupportActionState } from "../support-admin-state";

export interface StaffSupportActionDependencies {
  readonly requireStaff: () => Promise<{ readonly user: { readonly id: string } }>;
  readonly updateTicket: (input: UpdateSupportTicketByStaffInput) => Promise<unknown>;
  readonly appendMessage: (input: AppendSupportMessageByStaffInput) => Promise<unknown>;
  readonly linkError: (input: SupportTicketErrorLinkInput) => Promise<unknown>;
  readonly unlinkError: (input: SupportTicketErrorLinkInput) => Promise<unknown>;
  readonly revalidate: (ticketId: string) => void | Promise<void>;
  readonly reportUnexpected: (error: unknown, route: string, staffUserId: string) => Promise<string | null>;
}

export interface StaffSupportActions {
  readonly update: (ticketId: string, form: FormData) => Promise<StaffSupportActionState>;
  readonly message: (ticketId: string, form: FormData) => Promise<StaffSupportActionState>;
  readonly link: (ticketId: string, form: FormData, remove: boolean) => Promise<StaffSupportActionState>;
}

export function createStaffSupportActions(deps: StaffSupportActionDependencies): StaffSupportActions {
  async function failure(error: unknown, staffUserId: string): Promise<StaffSupportActionState> {
    if (error instanceof SupportQueryError) {
      return { kind: error.code === "conflict" ? "conflict" : "invalid", message: error.code === "conflict" ? "This ticket changed or the submission was already used. Refresh it before trying again; your draft is kept." : error.message };
    }
    let reference: string | null = null;
    try { reference = await deps.reportUnexpected(error, "/support/[id]", staffUserId); } catch { /* The support form remains usable when monitoring is unavailable. */ }
    return { kind: "error", message: "Couldn’t save this change. Your draft is kept. Please try again.", ...(reference === null ? {} : { reference }) };
  }
  return {
    async update(ticketId, form): Promise<StaffSupportActionState> {
      const { user } = await deps.requireStaff();
      const parsed = staffSupportUpdateSchema.safeParse({ ticketId, expectedVersion: form.get("expectedVersion"), status: form.get("status"), category: form.get("category"), priority: form.get("priority"), assigneeStaffId: form.get("assigneeStaffId") || null });
      if (!parsed.success) return { kind: "invalid", message: "Check the ticket status, category, priority and assignee.", field: String(parsed.error.issues[0]?.path[0] ?? "") };
      try { await deps.updateTicket({ ...parsed.data, staffUserId: user.id }); await deps.revalidate(ticketId); return { kind: "saved", message: "Ticket updated." }; }
      catch (error) { return failure(error, user.id); }
    },
    async message(ticketId, form): Promise<StaffSupportActionState> {
      const { user } = await deps.requireStaff();
      const parsed = staffSupportMessageSchema.safeParse({ ticketId, body: form.get("body"), visibility: form.get("visibility"), submissionKey: form.get("submissionKey") });
      if (!parsed.success) return { kind: "invalid", message: "Write a message of 1 to 5,000 characters and choose who can see it.", field: String(parsed.error.issues[0]?.path[0] ?? "") };
      try {
        await deps.appendMessage({ ...parsed.data, staffUserId: user.id }); await deps.revalidate(ticketId);
        return { kind: "saved", message: parsed.data.visibility === "internal" ? "Internal note saved. Only staff can see it." : "Reply added to the requester’s ticket.", submissionKey: crypto.randomUUID() };
      } catch (error) { return failure(error, user.id); }
    },
    async link(ticketId, form, remove): Promise<StaffSupportActionState> {
      const { user } = await deps.requireStaff();
      const parsed = staffSupportLinkSchema.safeParse({ ticketId, issueId: form.get("issueId") });
      if (!parsed.success) return { kind: "invalid", message: "Paste the automatic error’s UUID issue reference.", field: "issueId" };
      try {
        const input = { ...parsed.data, staffUserId: user.id };
        if (remove) await deps.unlinkError(input); else await deps.linkError(input);
        await deps.revalidate(ticketId); return { kind: "saved", message: remove ? "Private error link removed." : "Automatic error linked privately." };
      } catch (error) { return failure(error, user.id); }
    },
  };
}
