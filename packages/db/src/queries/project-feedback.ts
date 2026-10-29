import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { projectFeedbackTickets, supportTickets, type SupportStatus } from "../schema";

/**
 * Records that a support ticket is the feedback a customer sent on a project's preview. Written through the staff connection
 * when the feedback is sent. A retry with the same ticket finds the row already there and leaves it as it was.
 */
export async function linkFeedbackTicket(
  db: Database,
  input: { readonly ticketId: string; readonly projectId: string; readonly businessId: string; readonly round: number },
): Promise<void> {
  await db
    .insert(projectFeedbackTickets)
    .values({ ticketId: input.ticketId, projectId: input.projectId, businessId: input.businessId, round: input.round })
    .onConflictDoNothing({ target: projectFeedbackTickets.ticketId });
}

/** The project, business and round a support ticket was sent as preview feedback for, or null when it was not. */
export async function findFeedbackLinkForTicket(
  db: Database,
  ticketId: string,
): Promise<{ readonly projectId: string; readonly businessId: string; readonly round: number } | null> {
  const [link] = await db
    .select({
      projectId: projectFeedbackTickets.projectId,
      businessId: projectFeedbackTickets.businessId,
      round: projectFeedbackTickets.round,
    })
    .from(projectFeedbackTickets)
    .where(eq(projectFeedbackTickets.ticketId, ticketId))
    .limit(1);
  return link ?? null;
}

/** The feedback sent on one project, newest first. Scoped by the business as well as the project, so a wrong business finds nothing. */
export async function listFeedbackForProject(
  db: Database,
  input: { readonly projectId: string; readonly businessId: string },
): Promise<
  readonly {
    readonly ticketId: string;
    readonly displayRef: string;
    readonly subject: string;
    readonly status: SupportStatus;
    readonly round: number;
    readonly createdAt: Date;
  }[]
> {
  return db
    .select({
      ticketId: projectFeedbackTickets.ticketId,
      displayRef: supportTickets.displayRef,
      subject: supportTickets.subject,
      status: supportTickets.status,
      round: projectFeedbackTickets.round,
      createdAt: projectFeedbackTickets.createdAt,
    })
    .from(projectFeedbackTickets)
    .innerJoin(supportTickets, eq(supportTickets.id, projectFeedbackTickets.ticketId))
    .where(and(eq(projectFeedbackTickets.projectId, input.projectId), eq(projectFeedbackTickets.businessId, input.businessId)))
    .orderBy(desc(projectFeedbackTickets.createdAt), desc(projectFeedbackTickets.ticketId));
}
