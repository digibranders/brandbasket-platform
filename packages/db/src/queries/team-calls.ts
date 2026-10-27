import { and, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { isCallReason, MAX_CALL_NOTE_LENGTH, type CallReason } from "../call-reasons";
import type { ScopedTransaction } from "../scope";
import { businessMembers, setupCallBookings, teamCalls, users, type TeamCall } from "../schema";

type Runner = Database | ScopedTransaction;

/** A business has a handful of calls; this is a ceiling, not a page size. */
const LIST_LIMIT = 100;

/** A business's calls, newest first. Read through row-level security as the customer, or with the staff connection. */
export async function listTeamCalls(db: Runner, businessId: string): Promise<TeamCall[]> {
  return db.select().from(teamCalls).where(eq(teamCalls.businessId, businessId)).orderBy(desc(teamCalls.startsAt), desc(teamCalls.id)).limit(LIST_LIMIT);
}

/** One call of the business, or null when it has none by that id. */
export async function findTeamCall(db: Runner, businessId: string, id: string): Promise<TeamCall | null> {
  const rows = await db.select().from(teamCalls).where(and(eq(teamCalls.id, id), eq(teamCalls.businessId, businessId))).limit(1);
  return rows[0] ?? null;
}

export interface NewTeamCall {
  readonly businessId: string;
  readonly reason: CallReason;
  readonly note: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The booking service's address for this booking, or null when it gave none. */
  readonly providerUri: string | null;
}

/**
 * Notes a call the dashboard just booked. One call per booking address: if the booking is already recorded (Cal.com's
 * webhook was first, or this is a second try) the call that is there is returned and `created` is false. Customer
 * connection: the business must be the signed-in one.
 */
export async function recordTeamCall(db: Runner, input: NewTeamCall): Promise<{ readonly id: string; readonly created: boolean }> {
  const inserted = await db
    .insert(teamCalls)
    .values({
      businessId: input.businessId,
      reason: input.reason,
      note: input.note,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      providerUri: input.providerUri,
    })
    .onConflictDoNothing({ target: teamCalls.providerUri })
    .returning({ id: teamCalls.id });
  const created = inserted[0];
  if (created !== undefined) return { id: created.id, created: true };
  if (input.providerUri === null) throw new Error("A call without a booking address cannot clash with another");
  const existing = await db
    .select({ id: teamCalls.id })
    .from(teamCalls)
    .where(and(eq(teamCalls.providerUri, input.providerUri), eq(teamCalls.businessId, input.businessId)))
    .limit(1);
  const row = existing[0];
  if (row === undefined) throw new Error("That booking already belongs to a call of another business");
  return { id: row.id, created: false };
}

/** The customer cancels a call that has not started. True when a call was cancelled. */
export async function cancelTeamCall(db: Runner, input: { readonly id: string; readonly businessId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(teamCalls)
    .set({ status: "cancelled", cancelledAt: input.now, updatedAt: input.now })
    .where(and(eq(teamCalls.id, input.id), eq(teamCalls.businessId, input.businessId), eq(teamCalls.status, "booked"), gt(teamCalls.startsAt, input.now)))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}

/** Cal.com says a booking was cancelled. Only a booked call is cancelled: one that was held keeps its place. True when a call was cancelled. Staff connection. */
export async function cancelTeamCallByUri(db: Runner, providerUri: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(teamCalls)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(and(eq(teamCalls.providerUri, providerUri), eq(teamCalls.status, "booked")))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}

/**
 * Cal.com says a booking was rescheduled: the call moves to the new time and booking address. If the new booking was already
 * recorded (its own "created" notice came first) that call stands and the old one is cancelled, so no booking is held twice.
 * True when a call moved or was cancelled. Staff connection.
 */
export async function moveTeamCallByUri(
  db: Runner,
  input: { readonly fromProviderUri: string; readonly toProviderUri: string; readonly startsAt: Date; readonly endsAt: Date; readonly now: Date },
): Promise<boolean> {
  const recorded = await db.select({ id: teamCalls.id }).from(teamCalls).where(eq(teamCalls.providerUri, input.toProviderUri)).limit(1);
  if (recorded.length > 0) return cancelTeamCallByUri(db, input.fromProviderUri, input.now);
  const rows = await db
    .update(teamCalls)
    .set({ providerUri: input.toProviderUri, startsAt: input.startsAt, endsAt: input.endsAt, updatedAt: input.now })
    .where(and(eq(teamCalls.providerUri, input.fromProviderUri), eq(teamCalls.status, "booked")))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}

export type BookedCallOutcome = "recorded" | "known" | "ignored";

/**
 * What a Cal.com "booking created" notice is worth. The business is found from the people who booked: the attendee's email
 * must be the sign-in email of a member of exactly one business (or of the business the booking names, when the person
 * belongs to several). A booking that is the kickoff call, or that comes before the kickoff was held, is not a team call.
 * Anything unclear is ignored. Staff connection: the sender has no session.
 */
export async function recordBookedCallFromWebhook(
  db: Runner,
  input: {
    readonly providerUri: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly attendeeEmails: readonly string[];
    /** The business id the booking's own metadata names, or null. Believed only when the attendee belongs to it. */
    readonly businessHint: string | null;
    /** What the dashboard said the booking is for ("kickoff" or "call"), or null for a booking made on Cal.com's own page. */
    readonly purpose: "kickoff" | "call" | null;
    readonly reason: unknown;
    readonly note: unknown;
  },
): Promise<BookedCallOutcome> {
  if (input.purpose === "kickoff") return "ignored";
  const known = await db.select({ id: teamCalls.id }).from(teamCalls).where(eq(teamCalls.providerUri, input.providerUri)).limit(1);
  if (known.length > 0) return "known";
  const kickoff = await db.select({ id: setupCallBookings.id }).from(setupCallBookings).where(eq(setupCallBookings.inviteeUri, input.providerUri)).limit(1);
  if (kickoff.length > 0) return "ignored";

  const emails = input.attendeeEmails.map((email) => email.trim().toLowerCase()).filter((email) => email !== "");
  if (emails.length === 0) return "ignored";
  const memberships = await db
    .selectDistinct({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(inArray(sql<string>`lower(${users.email})`, emails));
  const businessIds = memberships.map((row) => row.businessId);
  const candidates = input.businessHint !== null && businessIds.includes(input.businessHint) ? [input.businessHint] : businessIds;
  const businessId = candidates.length === 1 ? candidates[0] : undefined;
  if (businessId === undefined) return "ignored";

  const held = await db
    .select({ id: setupCallBookings.id })
    .from(setupCallBookings)
    .where(and(eq(setupCallBookings.businessId, businessId), isNotNull(setupCallBookings.heldAt)))
    .limit(1);
  if (held.length === 0) return "ignored";

  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_CALL_NOTE_LENGTH).trim() : "";
  const inserted = await db
    .insert(teamCalls)
    .values({
      businessId,
      reason: isCallReason(input.reason) ? input.reason : "other",
      note: note === "" ? null : note,
      source: input.purpose === "call" ? "dashboard" : "booking_page",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      providerUri: input.providerUri,
    })
    .onConflictDoNothing({ target: teamCalls.providerUri })
    .returning({ id: teamCalls.id });
  return inserted.length > 0 ? "recorded" : "known";
}

/** Staff mark a call that has started as held. True when it is now held. Staff connection. */
export async function markTeamCallHeld(db: Runner, input: { readonly id: string; readonly businessId: string; readonly staffId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(teamCalls)
    .set({ status: "held", heldAt: input.now, heldByStaffId: input.staffId, updatedAt: input.now })
    .where(and(eq(teamCalls.id, input.id), eq(teamCalls.businessId, input.businessId), eq(teamCalls.status, "booked"), lte(teamCalls.startsAt, input.now)))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}

/** Undoes the mark. What was agreed goes with it, because only a held call has a summary. True when a held call is booked again. Staff connection. */
export async function clearTeamCallHeld(db: Runner, input: { readonly id: string; readonly businessId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(teamCalls)
    .set({ status: "booked", heldAt: null, heldByStaffId: null, summary: null, summaryAt: null, summaryByStaffId: null, updatedAt: input.now })
    .where(and(eq(teamCalls.id, input.id), eq(teamCalls.businessId, input.businessId), eq(teamCalls.status, "held")))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}

/** Staff write (or, with null, clear) what was agreed on a held call. True when a held call was updated. Staff connection. */
export async function saveTeamCallSummary(
  db: Runner,
  input: { readonly id: string; readonly businessId: string; readonly staffId: string; readonly summary: string | null; readonly now: Date },
): Promise<boolean> {
  const written =
    input.summary === null
      ? { summary: null, summaryAt: null, summaryByStaffId: null }
      : { summary: input.summary, summaryAt: input.now, summaryByStaffId: input.staffId };
  const rows = await db
    .update(teamCalls)
    .set({ ...written, updatedAt: input.now })
    .where(and(eq(teamCalls.id, input.id), eq(teamCalls.businessId, input.businessId), eq(teamCalls.status, "held")))
    .returning({ id: teamCalls.id });
  return rows.length > 0;
}
