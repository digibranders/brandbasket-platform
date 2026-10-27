import { and, asc, count, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ChangeState } from "../change-states";
import { isPhoneAccountEmail } from "../phone-account";
import { users } from "../schema/auth";
import { charges, type ChargeStatus } from "../schema/billing";
import { businesses } from "../schema/businesses";
import { changeRequestEvents, changeRequests, type ChangeRequest } from "../schema/change-requests";
import { supportTickets, type SupportStatus } from "../schema/support";
import type { ScopedTransaction } from "../scope";
import { unreadCondition } from "./support";

type Runner = Database | ScopedTransaction;

/** What went wrong with a change request, in a code the pages and actions can answer in plain words. */
export type ChangeRequestErrorCode =
  | "not_found"
  | "wrong_state"
  | "window_closed"
  | "no_included_left"
  | "not_website"
  | "invalid_input"
  | "forbidden";

export class ChangeRequestError extends Error {
  constructor(
    readonly code: ChangeRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChangeRequestError";
  }
}

/** The database's own words (migration 0190) for each way the customer's moves can be refused. */
const DATABASE_CODES: ReadonlyArray<readonly [string, ChangeRequestErrorCode]> = [
  ["change_request_not_found", "not_found"],
  ["change_request_not_allowed", "forbidden"],
  ["change_request_wrong_state", "wrong_state"],
  ["change_request_window_closed", "window_closed"],
  ["change_request_unknown_action", "invalid_input"],
];

/** Reads the message of an error and of everything under it (drizzle wraps the driver's error as `cause`). */
function messagesOf(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  return depth >= 4 || error.cause === undefined ? error.message : `${error.message}\n${messagesOf(error.cause, depth + 1)}`;
}

/** The change-request error behind a database error, or null when it is something else (which should be rethrown). */
export function changeRequestErrorFrom(error: unknown): ChangeRequestError | null {
  if (error instanceof ChangeRequestError) return error;
  const text = messagesOf(error);
  const found = DATABASE_CODES.find(([marker]) => text.includes(marker));
  if (found === undefined) return null;
  return new ChangeRequestError(found[1], `The change request could not be changed: ${found[0].replaceAll("_", " ")}.`);
}

export interface QuoteView {
  readonly what: string;
  readonly hours: number;
  readonly unitCents: number;
  readonly amountCents: number;
  readonly currency: "USD" | "INR";
  readonly workingDays: number;
  readonly quotedAt: Date;
}

/** A change request as the pages read it: the row, its quote gathered up, and the state of the charge it opened. */
export interface ChangeView {
  readonly id: string;
  readonly ticketId: string;
  readonly businessId: string;
  readonly kind: ChangeRequest["kind"];
  readonly page: string | null;
  readonly state: ChangeState;
  readonly coverage: ChangeRequest["coverage"];
  readonly quote: QuoteView | null;
  readonly acceptedAt: Date | null;
  readonly chargeId: string | null;
  readonly chargeStatus: ChargeStatus | null;
  readonly closedReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ChangeEventView {
  readonly state: ChangeState;
  readonly at: Date;
}

export function toChangeView(row: ChangeRequest, chargeStatus: ChargeStatus | null): ChangeView {
  const quote: QuoteView | null =
    row.quoteWhat === null ||
    row.quoteHours === null ||
    row.quoteUnitCents === null ||
    row.quoteAmountCents === null ||
    row.quoteCurrency === null ||
    row.quoteWorkingDays === null ||
    row.quotedAt === null
      ? null
      : {
          what: row.quoteWhat,
          hours: row.quoteHours,
          unitCents: row.quoteUnitCents,
          amountCents: row.quoteAmountCents,
          currency: row.quoteCurrency,
          workingDays: row.quoteWorkingDays,
          quotedAt: row.quotedAt,
        };
  return {
    id: row.id,
    ticketId: row.ticketId,
    businessId: row.businessId,
    kind: row.kind,
    page: row.page,
    state: row.state,
    coverage: row.coverage,
    quote,
    acceptedAt: row.acceptedAt,
    chargeId: row.chargeId,
    chargeStatus,
    closedReason: row.closedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One row of the Requests list: a conversation, and the change details when it is a request for a change. */
export interface RequestListItem {
  readonly ticketId: string;
  readonly displayRef: string;
  readonly subject: string;
  readonly ticketStatus: SupportStatus;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  /** The team replied and the customer has not read it yet. */
  readonly unread: boolean;
  /** Null for a question: a ticket with no change details. */
  readonly change: ChangeView | null;
}

const MAX_LIST = 100;

/**
 * The signed-in person's conversations for the business, newest activity first. Run it inside `withTenantScope`: the tickets
 * are the person's own (user scope) and the change details are the business's (tenant scope), and with only the user in
 * scope every request would read as a plain question.
 */
export async function listRequestItems(db: ScopedTransaction, userId: string, limit = MAX_LIST): Promise<RequestListItem[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST) throw new RangeError(`The Requests list holds 1 to ${MAX_LIST} rows, received ${limit}`);
  const rows = await db
    .select({
      ticket: supportTickets,
      unread: sql<boolean>`${unreadCondition(userId)}`,
      change: changeRequests,
      chargeStatus: charges.status,
    })
    .from(supportTickets)
    .leftJoin(changeRequests, eq(changeRequests.ticketId, supportTickets.id))
    .leftJoin(charges, eq(charges.id, changeRequests.chargeId))
    .where(eq(supportTickets.requesterUserId, userId))
    .orderBy(desc(supportTickets.lastActivityAt), desc(supportTickets.id))
    .limit(limit);
  return rows.map((row) => ({
    ticketId: row.ticket.id,
    displayRef: row.ticket.displayRef,
    subject: row.ticket.subject,
    ticketStatus: row.ticket.status,
    createdAt: row.ticket.createdAt,
    lastActivityAt: row.ticket.lastActivityAt,
    unread: row.unread,
    change: row.change === null ? null : toChangeView(row.change, row.chargeStatus),
  }));
}

/** One request with the dates it moved on, for the stepper. Null for a ticket that is not a change request. */
export async function getChangeWithEvents(
  db: Runner,
  ticketId: string,
): Promise<{ readonly change: ChangeView; readonly events: readonly ChangeEventView[] } | null> {
  const [row] = await db
    .select({ change: changeRequests, chargeStatus: charges.status })
    .from(changeRequests)
    .leftJoin(charges, eq(charges.id, changeRequests.chargeId))
    .where(eq(changeRequests.ticketId, ticketId))
    .limit(1);
  if (row === undefined) return null;
  const events = await db
    .select({ state: changeRequestEvents.state, at: changeRequestEvents.at })
    .from(changeRequestEvents)
    .where(eq(changeRequestEvents.changeRequestId, row.change.id))
    .orderBy(asc(changeRequestEvents.at), asc(changeRequestEvents.id));
  return { change: toChangeView(row.change, row.chargeStatus), events };
}

/**
 * How many included edits the business has used between `from` (inclusive) and `to` (exclusive): requests covered as
 * included that were sent in the window and are still going ahead (one that was declined or withdrawn gives its edit back).
 * Works through row-level security for the customer and on the staff connection.
 */
export async function countIncludedEdits(db: Runner, businessId: string, window: { readonly from: Date; readonly to: Date }): Promise<number> {
  const [row] = await db
    .select({ used: count() })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.businessId, businessId),
        eq(changeRequests.coverage, "included"),
        notInArray(changeRequests.state, ["declined", "withdrawn"]),
        gte(changeRequests.createdAt, window.from),
        lt(changeRequests.createdAt, window.to),
      ),
    );
  return row?.used ?? 0;
}

/** A change that is waiting on the customer: a quote to accept (or pay), or a change to check. */
export interface RequestNeed {
  readonly ticketId: string;
  readonly subject: string;
  readonly kind: ChangeRequest["kind"];
  readonly state: "quoted" | "preview";
  readonly quote: QuoteView | null;
  readonly acceptedAt: Date | null;
  readonly updatedAt: Date;
}

/** What the signed-in person has to act on, oldest first. Run inside `withTenantScope`. */
export async function listRequestNeeds(db: ScopedTransaction, userId: string): Promise<RequestNeed[]> {
  const rows = await db
    .select({ ticket: supportTickets, change: changeRequests })
    .from(changeRequests)
    .innerJoin(supportTickets, eq(supportTickets.id, changeRequests.ticketId))
    .where(and(eq(supportTickets.requesterUserId, userId), inArray(changeRequests.state, ["quoted", "preview"])))
    .orderBy(asc(changeRequests.updatedAt), asc(changeRequests.id));
  return rows.flatMap((row): RequestNeed[] => {
    const view = toChangeView(row.change, null);
    if (view.state !== "quoted" && view.state !== "preview") return [];
    return [{ ticketId: view.ticketId, subject: row.ticket.subject, kind: view.kind, state: view.state, quote: view.quote, acceptedAt: view.acceptedAt, updatedAt: view.updatedAt }];
  });
}

/** A conversation with a reply from the team that the person has not read. */
export interface UnreadReply {
  readonly ticketId: string;
  readonly subject: string;
}

/** The newest conversations with an unread reply, for the bell. Run inside `withTenantScope`, or with the person's user scope. */
export async function listUnreadReplies(db: Runner, userId: string, limit = 5): Promise<UnreadReply[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RangeError(`The bell lists 1 to 20 unread replies, received ${limit}`);
  const rows = await db
    .select({ ticketId: supportTickets.id, subject: supportTickets.subject })
    .from(supportTickets)
    .where(and(eq(supportTickets.requesterUserId, userId), unreadCondition(userId)))
    .orderBy(desc(supportTickets.lastActivityAt), desc(supportTickets.id))
    .limit(limit);
  return rows;
}

/** The moves a customer can make themselves. Accepting a quote is separate: it opens a charge (acceptChangeQuote). */
export type CustomerMove = "decline" | "approve" | "reopen";

/**
 * The customer's own moves, through the database function that checks the business, the state and the 14 days. Run inside
 * `withTenantScope`. Returns the state the request is now in. Throws ChangeRequestError for a refused move.
 */
export async function moveChangeAsCustomer(db: ScopedTransaction, requestId: string, move: CustomerMove): Promise<ChangeState> {
  try {
    const result = await db.execute<{ state: ChangeState }>(sql`select change_request_customer_move(${requestId}::uuid, ${move}) as state`);
    const state = result.rows[0]?.state;
    if (state === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
    return state;
  } catch (error) {
    throw changeRequestErrorFrom(error) ?? error;
  }
}

/** A change request for the console's client page: the row, its ticket and when the team last heard from the customer. */
export interface StaffRequestItem {
  readonly ticketId: string;
  readonly displayRef: string;
  readonly subject: string;
  readonly ticketStatus: SupportStatus;
  readonly createdAt: Date;
  readonly change: ChangeView;
}

/** Every change request of one business, newest first. Staff connection. */
export async function listChangeRequestsForBusiness(db: Database, businessId: string, limit = 50): Promise<StaffRequestItem[]> {
  const rows = await db
    .select({ ticket: supportTickets, change: changeRequests, chargeStatus: charges.status })
    .from(changeRequests)
    .innerJoin(supportTickets, eq(supportTickets.id, changeRequests.ticketId))
    .leftJoin(charges, eq(charges.id, changeRequests.chargeId))
    .where(eq(changeRequests.businessId, businessId))
    .orderBy(desc(changeRequests.createdAt), desc(changeRequests.id))
    .limit(limit);
  return rows.map((row) => ({
    ticketId: row.ticket.id,
    displayRef: row.ticket.displayRef,
    subject: row.ticket.subject,
    ticketStatus: row.ticket.status,
    createdAt: row.ticket.createdAt,
    change: toChangeView(row.change, row.chargeStatus),
  }));
}

/** One request by id with its ticket's subject. Staff connection. Null when there is none. */
export async function getChangeRequestForStaff(db: Runner, requestId: string): Promise<StaffRequestItem | null> {
  const [row] = await db
    .select({ ticket: supportTickets, change: changeRequests, chargeStatus: charges.status })
    .from(changeRequests)
    .innerJoin(supportTickets, eq(supportTickets.id, changeRequests.ticketId))
    .leftJoin(charges, eq(charges.id, changeRequests.chargeId))
    .where(eq(changeRequests.id, requestId))
    .limit(1);
  if (row === undefined) return null;
  return {
    ticketId: row.ticket.id,
    displayRef: row.ticket.displayRef,
    subject: row.ticket.subject,
    ticketStatus: row.ticket.status,
    createdAt: row.ticket.createdAt,
    change: toChangeView(row.change, row.chargeStatus),
  };
}

/** Who to write to about a ticket. */
export interface RequestRecipient {
  readonly ticketId: string;
  readonly subject: string;
  readonly name: string;
  /** Null for an account that signs in with a phone number: it has no address to write to. */
  readonly email: string | null;
  readonly businessName: string | null;
  readonly isChange: boolean;
}

/** The person who asked, for an email about their ticket. Staff connection. */
export async function findRequestRecipient(db: Database, ticketId: string): Promise<RequestRecipient | null> {
  const [row] = await db
    .select({
      subject: supportTickets.subject,
      name: users.name,
      email: users.email,
      businessName: businesses.name,
      requestId: changeRequests.id,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.requesterUserId))
    .leftJoin(businesses, eq(businesses.id, supportTickets.businessId))
    .leftJoin(changeRequests, eq(changeRequests.ticketId, supportTickets.id))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (row === undefined) return null;
  return {
    ticketId,
    subject: row.subject,
    name: row.name,
    email: isPhoneAccountEmail(row.email) ? null : row.email,
    businessName: row.businessName,
    isChange: row.requestId !== null,
  };
}
