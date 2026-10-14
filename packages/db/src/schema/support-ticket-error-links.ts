import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { supportTickets } from "./support";
import { staffMembers } from "./staff";
import { errorIssues } from "./error-issues";

/** Private staff associations. Customers never see automatic incident data or these links. */
export const supportTicketErrorLinks = pgTable("support_ticket_error_links", {
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").notNull().references(() => errorIssues.id, { onDelete: "cascade" }),
  linkedByStaffId: text("linked_by_staff_id").notNull().references(() => staffMembers.userId),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.ticketId, table.issueId] })]);
