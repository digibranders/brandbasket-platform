import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { staffMembers } from "../schema/staff";
import { supportTickets } from "../schema/support";
import { errorIssues } from "../schema/error-issues";
import { supportTicketErrorLinks } from "../schema/support-ticket-error-links";
import { assertSupportUuid, SupportQueryError } from "./support";
import { approximateAffectedUsers, type ErrorIssue } from "./error-issues";

export interface SupportTicketErrorLinkInput {
  readonly staffUserId: string;
  readonly ticketId: string;
  readonly issueId: string;
}

async function assertActiveStaff(db: Database, staffUserId: string): Promise<void> {
  const rows = await db.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.userId, staffUserId), eq(staffMembers.active, true))).limit(1);
  if (rows.length === 0) throw new SupportQueryError("forbidden", "An active staff account is required to link automatic errors.");
}

export async function linkSupportTicketError(db: Database, input: SupportTicketErrorLinkInput): Promise<boolean> {
  assertSupportUuid(input.ticketId, "Ticket ID"); assertSupportUuid(input.issueId, "Issue ID");
  await assertActiveStaff(db, input.staffUserId);
  const [tickets, issues] = await Promise.all([
    db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1),
    db.select({ id: errorIssues.id }).from(errorIssues).where(eq(errorIssues.id, input.issueId)).limit(1),
  ]);
  if (tickets.length === 0 || issues.length === 0) throw new SupportQueryError("not_found", "The ticket or automatic error was not found.");
  const rows = await db.insert(supportTicketErrorLinks).values({ ticketId: input.ticketId, issueId: input.issueId, linkedByStaffId: input.staffUserId }).onConflictDoNothing().returning({ issueId: supportTicketErrorLinks.issueId });
  return rows.length > 0;
}

export async function unlinkSupportTicketError(db: Database, input: SupportTicketErrorLinkInput): Promise<boolean> {
  assertSupportUuid(input.ticketId, "Ticket ID"); assertSupportUuid(input.issueId, "Issue ID");
  await assertActiveStaff(db, input.staffUserId);
  const rows = await db.delete(supportTicketErrorLinks).where(and(eq(supportTicketErrorLinks.ticketId, input.ticketId), eq(supportTicketErrorLinks.issueId, input.issueId))).returning({ issueId: supportTicketErrorLinks.issueId });
  return rows.length > 0;
}

export async function listSupportTicketErrors(db: Database, ticketId: string, staffUserId: string): Promise<ErrorIssue[]> {
  assertSupportUuid(ticketId, "Ticket ID"); await assertActiveStaff(db, staffUserId);
  const rows = await db.select({ issue: errorIssues }).from(supportTicketErrorLinks).innerJoin(errorIssues, eq(errorIssues.id, supportTicketErrorLinks.issueId)).where(eq(supportTicketErrorLinks.ticketId, ticketId)).orderBy(desc(supportTicketErrorLinks.linkedAt)).limit(50);
  return rows.map(({ issue: row }) => {
    const { userBits, ...issue } = row;
    return { ...issue, affectedUsers: approximateAffectedUsers(userBits) };
  });
}
