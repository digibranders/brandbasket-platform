import "server-only";
import { SupportQueryError, type UpdateSupportTicketByStaffInput } from "@brandbasket/db";
import { canTransitionSupportStatus, SUPPORT_STATUSES, type SupportStatus } from "@brandbasket/shared/lib/support";
import { z } from "zod";

export type TicketStatusResult = { readonly ok: true; readonly previous: SupportStatus; readonly current: SupportStatus } | { readonly ok: false; readonly message: string };

export interface TicketStatusDependencies {
  readonly requireStaff: () => Promise<{ readonly user: { readonly id: string } }>;
  readonly readTicket: (ticketId: string) => Promise<{ readonly status: SupportStatus; readonly version: number } | null>;
  readonly updateTicket: (input: UpdateSupportTicketByStaffInput) => Promise<unknown>;
  readonly revalidate: (ticketId: string) => void | Promise<void>;
  readonly reportUnexpected: (error: unknown, route: string, staffUserId: string) => Promise<string | null>;
}

export interface TicketStatusActions {
  /** Closes an open request. Status only: nobody is emailed. It is set to Resolved, which staff can move back; Closed cannot be. */
  readonly close: (ticketId: string) => Promise<TicketStatusResult>;
  /** Opens a closed (resolved) request again. Status only: nobody is emailed. */
  readonly reopen: (ticketId: string) => Promise<TicketStatusResult>;
  /** Puts a request back to a status it had (the Undo of close and reopen), or to Triaged where the old status cannot be reached. */
  readonly restore: (ticketId: string, to: string) => Promise<TicketStatusResult>;
}

const FINISHED: ReadonlySet<SupportStatus> = new Set(["resolved", "closed"]);
const ticketIdSchema = z.uuid();
const statusSchema = z.enum(SUPPORT_STATUSES);

export function createTicketStatusActions(deps: TicketStatusDependencies): TicketStatusActions {
  async function move(ticketId: string, choose: (current: SupportStatus) => SupportStatus | string): Promise<TicketStatusResult> {
    const { user } = await deps.requireStaff();
    if (!ticketIdSchema.safeParse(ticketId).success) return { ok: false, message: "That request could not be found." };
    try {
      const ticket = await deps.readTicket(ticketId);
      if (ticket === null) return { ok: false, message: "That request could not be found." };
      const target = choose(ticket.status);
      const parsed = statusSchema.safeParse(target);
      if (!parsed.success) return { ok: false, message: target };
      if (parsed.data === ticket.status) return { ok: true, previous: ticket.status, current: ticket.status };
      await deps.updateTicket({ staffUserId: user.id, ticketId, expectedVersion: ticket.version, status: parsed.data });
      await deps.revalidate(ticketId);
      return { ok: true, previous: ticket.status, current: parsed.data };
    } catch (error) {
      if (error instanceof SupportQueryError) {
        return { ok: false, message: error.code === "conflict" ? "This request changed. Reload the list and try again." : error.message };
      }
      let reference: string | null = null;
      try {
        reference = await deps.reportUnexpected(error, "/support", user.id);
      } catch {
        /* The list stays usable when monitoring is unavailable. */
      }
      return { ok: false, message: `The change did not save. Nothing was changed.${reference === null ? "" : ` Reference ${reference}.`}` };
    }
  }

  return {
    close: (ticketId) => move(ticketId, (current) => (FINISHED.has(current) ? "This request is already closed." : "resolved")),
    reopen: (ticketId) =>
      move(ticketId, (current) => {
        if (current === "resolved") return "triaged";
        return current === "closed" ? "A closed request cannot be reopened here." : "This request is already open.";
      }),
    restore: (ticketId, to) =>
      move(ticketId, (current) => {
        const wanted = statusSchema.safeParse(to);
        if (!wanted.success) return "That status is not one a request can have.";
        return canTransitionSupportStatus(current, wanted.data) ? wanted.data : "triaged";
      }),
  };
}
