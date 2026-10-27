import "server-only";
import { findClientDetail, SupportQueryError, type CreateSupportTicketByStaffInput, type Database } from "@brandbasket/db";
import { supportRequestOpenedEmail } from "@brandbasket/email";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { OPENED_REQUEST_MESSAGES, staffOpenRequestSchema, type OpenedRequestOutcome, type StaffSupportActionState } from "../support-admin-state";
import type { StaffActionEntry } from "./activity";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";
import type { GrantedStaff } from "./staff-access";

export type OwnerEmailOutcome = Exclude<OpenedRequestOutcome, "replayed">;

export interface OpenRequestDependencies {
  readonly requireStaff: () => Promise<GrantedStaff>;
  readonly createTicket: (input: CreateSupportTicketByStaffInput) => Promise<{ readonly ticket: { readonly id: string; readonly displayRef: string }; readonly created: boolean }>;
  readonly emailOwner: (input: { readonly businessId: string; readonly ticketId: string; readonly subject: string }) => Promise<OwnerEmailOutcome>;
  readonly recordAction: (staff: GrantedStaff, entry: StaffActionEntry) => Promise<void>;
  readonly revalidate: (ticketId: string) => void;
  readonly reportUnexpected: (error: unknown, staffUserId: string) => Promise<string | null>;
}

/** Opens a request for a client from the "New request for a client" form. The request stands even if the email does not go. */
export function createOpenRequestAction(deps: OpenRequestDependencies): (form: FormData) => Promise<StaffSupportActionState> {
  return async (form) => {
    const staff = await deps.requireStaff();
    const parsed = staffOpenRequestSchema.safeParse({
      businessId: form.get("businessId"),
      category: form.get("category"),
      subject: form.get("subject"),
      body: form.get("body"),
      submissionKey: form.get("submissionKey"),
    });
    if (!parsed.success) {
      return { kind: "invalid", message: "Choose the client and a category, write a subject of 3 to 120 characters, and what they asked for in 10 to 5,000 characters.", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    }
    let result: Awaited<ReturnType<OpenRequestDependencies["createTicket"]>>;
    try {
      result = await deps.createTicket({ ...parsed.data, staffUserId: staff.user.id });
    } catch (error) {
      if (error instanceof SupportQueryError) {
        return error.code === "conflict"
          ? { kind: "conflict", message: "This form was already sent with different text. Reload the page to start a new request." }
          : { kind: "invalid", message: error.message };
      }
      let reference: string | null = null;
      try {
        reference = await deps.reportUnexpected(error, staff.user.id);
      } catch {
        // The form stays usable when error monitoring is down.
      }
      return { kind: "error", message: "Couldn’t open the request. Your text is kept. Please try again.", ...(reference === null ? {} : { reference }) };
    }
    const { ticket } = result;
    deps.revalidate(ticket.id);
    if (!result.created) return { kind: "saved", message: OPENED_REQUEST_MESSAGES.replayed, ticketId: ticket.id, openedOutcome: "replayed" };
    const emailed = await deps.emailOwner({ businessId: parsed.data.businessId, ticketId: ticket.id, subject: parsed.data.subject }).catch((): OwnerEmailOutcome => "failed");
    await deps.recordAction(staff, {
      businessId: parsed.data.businessId,
      kind: "request.opened_for_client",
      summary: "Opened a request for the client",
      data: { ticketId: ticket.id, reference: ticket.displayRef, category: parsed.data.category, ownerEmail: emailed },
    });
    return { kind: "saved", message: OPENED_REQUEST_MESSAGES[emailed], ticketId: ticket.id, openedOutcome: emailed };
  };
}

/** Emails the business owner a link to the request staff opened. An owner who signs in with a mobile number has no address. */
export async function emailRequestOwner(db: Database, input: { readonly businessId: string; readonly ticketId: string; readonly subject: string }): Promise<OwnerEmailOutcome> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null || client.owner.email === null) return "no-email";
  try {
    await customerEmailTransport(db).send(
      supportRequestOpenedEmail({
        to: client.owner.email,
        businessName: client.businessName,
        subject: input.subject,
        requestUrl: new URL(`/support/${input.ticketId}`, serverEnv().APP_ORIGIN).toString(),
      }),
    );
    return "emailed";
  } catch (error) {
    console.error("[support] could not email the owner about a request staff opened", errorLogInfo(error));
    return "failed";
  }
}
